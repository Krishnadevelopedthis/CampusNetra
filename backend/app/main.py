"""Campus Netra API — application entrypoint."""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.services import influx_client
from app.services import iot_health as iot_health_svc
from app.services import mqtt_client
from app.services import permissions as perm_service
from app.services import sla

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(name)s: %(message)s",
)
log = logging.getLogger("campusnetra")


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("Database connection established")
    except Exception as exc:
        # Surface the problem loudly but let the process start, so /health can report it.
        log.error("Database unreachable at startup: %s", exc)

    log.info(
        "%s starting — env=%s, AI=%s",
        settings.APP_NAME,
        settings.ENVIRONMENT,
        "enabled" if settings.ai_available else "heuristic fallback (no API key)",
    )

    # Must happen before the app starts accepting requests: require_permission()
    # (app/api/deps.py) reads role_permissions on every gated request, and an
    # empty table there would mean every one of those routes denies everyone
    # until an admin happened to open Admin > Roles first.
    try:
        async with SessionLocal() as db:
            await perm_service.ensure_seeded(db)
    except Exception:
        log.exception("Could not seed default permissions")

    # An SLA breach is the passage of time, so nothing in the request path can
    # notice it. This is the only thing in the system that runs on its own.
    sweeper = asyncio.create_task(sla.scheduler(SessionLocal))

    # ESP32 -> HiveMQ Cloud telemetry bridge (no-op if MQTT isn't configured)
    # and the IoT device offline sweep -- same "runs on its own, the request
    # path can't notice it" reasoning as the SLA sweeper above.
    mqtt_task = asyncio.create_task(mqtt_client.run())
    iot_offline_sweeper = asyncio.create_task(iot_health_svc.offline_sweep_scheduler(SessionLocal))

    yield

    sweeper.cancel()
    with suppress(asyncio.CancelledError):
        await sweeper
    mqtt_task.cancel()
    with suppress(asyncio.CancelledError):
        await mqtt_task
    iot_offline_sweeper.cancel()
    with suppress(asyncio.CancelledError):
        await iot_offline_sweeper
    await engine.dispose()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description=(
        "AI-powered campus facility management: issue reporting with automatic "
        "department routing, work orders, inspections, AI Lost & Found matching, "
        "and a live spatial Digital Twin."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Flatten pydantic errors into a shape the frontend forms can display per-field."""
    fields: dict[str, str] = {}
    for err in exc.errors():
        loc = [str(p) for p in err["loc"] if p not in ("body", "query", "path")]
        fields[".".join(loc) or "_"] = err["msg"]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Please correct the highlighted fields.", "fields": fields},
        headers=_cors_headers(request),
    )


# --------------------------------------------------------------------------
# Failure disclosure
#
# Anything raised deliberately by a route is a message we wrote for the person
# reading it, and passes through untouched. Anything else — a driver error, a
# constraint we did not anticipate, a bug — is a sentence we never wrote, and
# frequently contains a table name, a SQL fragment or a connection string. Those
# are replaced with a fixed message and a reference the logs can be searched by,
# so support can find the real cause without it ever reaching the screen.
# --------------------------------------------------------------------------

GENERIC_ERROR = (
    "Something went wrong on our end. The team has been notified — "
    "please try again in a moment."
)


def _reference() -> str:
    """Short, quotable, and enough to find the traceback in the logs."""
    return uuid.uuid4().hex[:8]


def _cors_headers(request: Request) -> dict[str, str]:
    """Re-derives the same Access-Control-Allow-* headers CORSMiddleware
    would add — needed because a response built by one of the
    @app.exception_handler()s below is not guaranteed to pass back through
    CORSMiddleware the same way a normal route response does. Starlette's
    ExceptionMiddleware (where these handlers actually run) sits inside the
    user middleware stack, and in practice a response built there can reach
    the client with no Access-Control-Allow-Origin header at all — which
    the browser then reports as "blocked by CORS policy", even though the
    real failure was a 500 from the route itself. Every endpoint that ever
    throws an unhandled exception hits this, not just one — so the fix
    belongs here, once, rather than patched per-route.
    """
    origin = request.headers.get("origin")
    if not origin or origin not in settings.BACKEND_CORS_ORIGINS:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
    }


def _failure(request: Request, status_code: int, detail: str, ref: str | None = None) -> JSONResponse:
    body: dict[str, object] = {"detail": detail}
    if ref:
        body["reference"] = ref
    return JSONResponse(status_code=status_code, content=body, headers=_cors_headers(request))


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # A route that explicitly raises HTTPException — 4xx or 5xx — already
    # wrote that message for the person reading it (a 502 "search is
    # temporarily unavailable" is exactly as safe to show as a 404 "not
    # found"); it is still logged with a reference below for traceability,
    # but the message itself is not replaced. Masking was previously
    # applied to every 5xx regardless, which silently swallowed deliberate,
    # non-sensitive messages like the location-search proxy's own "try
    # again" text and replaced them with the generic unhandled-bug message
    # instead. Only a *true* unhandled exception (below, never routed
    # through StarletteHTTPException at all) still gets GENERIC_ERROR.
    if exc.status_code >= 500:
        ref = _reference()
        log.error("[%s] %s %s -> %s: %s",
                  ref, request.method, request.url.path, exc.status_code, exc.detail)
        detail = exc.detail if isinstance(exc.detail, str) else GENERIC_ERROR
        return _failure(request, exc.status_code, detail, ref)
    return _failure(request, exc.status_code, exc.detail if isinstance(exc.detail, str)
                    else "That request could not be completed.")


@app.exception_handler(IntegrityError)
async def integrity_handler(request: Request, exc: IntegrityError):
    """A constraint we did not check first. The driver's message names the
    constraint and often the row, so it is logged rather than returned."""
    ref = _reference()
    log.warning("[%s] integrity error on %s %s: %s",
                ref, request.method, request.url.path, exc.orig)
    return _failure(
        request, status.HTTP_409_CONFLICT,
        "That conflicts with something already saved. Refresh and try again.",
        ref,
    )


@app.exception_handler(OperationalError)
async def operational_handler(request: Request, exc: OperationalError):
    """The database is unreachable or refusing connections. Distinct from a bug:
    retrying actually is the right advice, and the status says so."""
    ref = _reference()
    log.error("[%s] database unavailable on %s %s: %s",
              ref, request.method, request.url.path, exc.orig)
    return _failure(
        request, status.HTTP_503_SERVICE_UNAVAILABLE,
        "The service is temporarily unavailable. Please try again shortly.",
        ref,
    )


@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_handler(request: Request, exc: SQLAlchemyError):
    ref = _reference()
    log.exception("[%s] database error on %s %s", ref, request.method, request.url.path)
    return _failure(request, status.HTTP_500_INTERNAL_SERVER_ERROR, GENERIC_ERROR, ref)


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    ref = _reference()
    log.exception("[%s] unhandled error on %s %s", ref, request.method, request.url.path)
    return _failure(request, status.HTTP_500_INTERNAL_SERVER_ERROR, GENERIC_ERROR, ref)


app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Locally-stored uploads (complaint photos, L&F images, floor plans).
if settings.STORAGE_BACKEND == "local":
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    app.mount("/media", StaticFiles(directory=settings.UPLOAD_DIR), name="media")


@app.get("/health", tags=["System"])
async def health():
    """Liveness + dependency probe used by the frontend's offline banner."""
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "up" if db_ok else "down",
        "ai": "live" if settings.ai_available else "heuristic",
        # Which transport is configured — the provider name only, never the key.
        # Without this there is no way to tell a deployment that cannot send
        # email from one whose mail is simply slow: production hides the
        # fallback code, so both look identical from the browser.
        "email": settings.email_provider,
        # MQTT: "disabled" (no MQTT_* env vars set) / "connecting" /
        # "connected" / "reconnecting" / "error: ...". InfluxDB: "disabled"
        # / "connected" (real ping) / "error: ...". Both let a deployment's
        # IoT wiring be confirmed from the outside after setting env vars,
        # without needing host log/dashboard access.
        "mqtt": mqtt_client.get_status(),
        "influx": await influx_client.get_status(),
        "environment": settings.ENVIRONMENT,
        "version": app.version,
    }


@app.get("/", tags=["System"])
async def root():
    return {"name": settings.APP_NAME, "docs": "/docs", "health": "/health"}
