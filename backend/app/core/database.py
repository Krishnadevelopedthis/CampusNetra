"""Async SQLAlchemy engine, session factory and FastAPI dependency."""
from typing import AsyncGenerator

from fastapi import Request
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped session, rolled back if the request fails.

    The commit deliberately does not happen here. A dependency's teardown runs
    after the response has been sent, so committing at this point hands the
    client an answer describing work that has not landed yet — a client acting
    on that answer immediately can be told the thing it was just given does not
    exist. The session is published on request.state so CommitRoute can commit
    it while the response is still being assembled.
    """
    async with SessionLocal() as session:
        request.state.db = session
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
