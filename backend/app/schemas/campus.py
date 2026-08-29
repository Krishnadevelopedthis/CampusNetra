"""Spatial hierarchy and Digital Twin payloads."""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.core.enums import AssetState, RoomKind
from app.schemas.common import ORMModel


class CampusOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    address: Optional[str] = None
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None


class BuildingOut(ORMModel):
    id: uuid.UUID
    campus_id: uuid.UUID
    name: str
    code: str
    floors_count: int
    map_x: Optional[Decimal] = None
    map_y: Optional[Decimal] = None


class FloorOut(ORMModel):
    id: uuid.UUID
    building_id: uuid.UUID
    name: str
    level: int
    floor_plan_url: Optional[str] = None
    plan_width: Optional[int] = None
    plan_height: Optional[int] = None


class RoomOut(ORMModel):
    id: uuid.UUID
    floor_id: uuid.UUID
    name: str
    code: str
    zone_id: Optional[str] = None
    kind: RoomKind
    capacity: Optional[int] = None
    area_sqft: Optional[Decimal] = None
    boundary: Optional[list] = None


class AssetOut(ORMModel):
    id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    category_id: uuid.UUID
    tag: str
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    state: AssetState
    pos_x: Optional[Decimal] = None
    pos_y: Optional[Decimal] = None
    purchase_date: Optional[datetime] = None
    warranty_expiry: Optional[datetime] = None
    cost: Optional[Decimal] = None
    last_service_at: Optional[datetime] = None
    service_interval_days: Optional[int] = None
    expected_life_months: Optional[int] = None
    annual_maintenance_cost: Optional[Decimal] = None
    warranty_months: Optional[int] = None


class AssetMarker(BaseModel):
    """One dot on the floor plan, pre-resolved for the renderer."""
    id: uuid.UUID
    tag: str
    name: str
    state: AssetState
    colour: str
    label: str
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    category_icon: Optional[str] = None
    open_issue_count: int = 0
    # Populated for markers currently in fault so the tooltip can show context.
    active_issue_reference: Optional[str] = None
    active_work_order_reference: Optional[str] = None


class RoomWithMarkers(BaseModel):
    id: uuid.UUID
    name: str
    code: str
    zone_id: Optional[str] = None
    kind: str
    capacity: Optional[int] = None
    area_sqft: Optional[float] = None
    boundary: Optional[list] = None
    # Worst state among the room's assets — drives the room fill colour.
    aggregate_state: str
    aggregate_colour: str
    open_issue_count: int
    assets: list[AssetMarker]


class FloorPlanOut(BaseModel):
    """Everything the Floor Plan View needs in one request."""
    floor: FloorOut
    building: BuildingOut
    rooms: list[RoomWithMarkers]
    legend: dict[str, dict[str, str]]
    generated_at: datetime


class CampusOverviewOut(BaseModel):
    campus: CampusOut
    buildings: list[dict]
    totals: dict
    state_breakdown: dict[str, int]


class AssetCategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    icon: Optional[str] = None
    default_priority: str


class BuildingCreate(BaseModel):
    campus_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=20)
    floors_count: int = Field(1, ge=1, le=100)
    map_x: Optional[float] = Field(None, ge=0, le=1)
    map_y: Optional[float] = Field(None, ge=0, le=1)


class FloorCreate(BaseModel):
    building_id: uuid.UUID
    name: str = Field(min_length=1, max_length=60)
    level: int
    floor_plan_url: Optional[str] = None


class RoomCreate(BaseModel):
    floor_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=30)
    kind: RoomKind = RoomKind.CLASSROOM
    capacity: Optional[int] = Field(None, ge=0)
    area_sqft: Optional[float] = Field(None, ge=0)
    boundary: Optional[list] = None


class AssetCreate(BaseModel):
    room_id: Optional[uuid.UUID] = None
    category_id: uuid.UUID
    tag: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=120)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    pos_x: Optional[float] = Field(None, ge=0, le=1)
    pos_y: Optional[float] = Field(None, ge=0, le=1)
    purchase_date: Optional[datetime] = None
    warranty_expiry: Optional[datetime] = None
    cost: Optional[float] = Field(None, ge=0)
    service_interval_days: Optional[int] = Field(None, ge=1)
    expected_life_months: Optional[int] = Field(None, ge=1)
    annual_maintenance_cost: Optional[float] = Field(None, ge=0)
    warranty_months: Optional[int] = Field(None, ge=0, le=600)


class AssetBulkCreate(AssetCreate):
    """Creating a run of identical assets — twelve tube lights in one lab.

    `tag` is treated as a stem when quantity > 1 and suffixed per unit, because
    tags are unique and typing twelve of them by hand is how registers stop
    being maintained.
    """
    quantity: int = Field(1, ge=1, le=200)


class AssetUpdate(BaseModel):
    room_id: Optional[uuid.UUID] = None
    category_id: Optional[uuid.UUID] = None
    tag: Optional[str] = Field(None, min_length=1, max_length=40)
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    pos_x: Optional[float] = Field(None, ge=0, le=1)
    pos_y: Optional[float] = Field(None, ge=0, le=1)
    purchase_date: Optional[datetime] = None
    warranty_expiry: Optional[datetime] = None
    cost: Optional[float] = Field(None, ge=0)
    last_service_at: Optional[datetime] = None
    service_interval_days: Optional[int] = Field(None, ge=1)
    expected_life_months: Optional[int] = Field(None, ge=1)
    annual_maintenance_cost: Optional[float] = Field(None, ge=0)
    warranty_months: Optional[int] = Field(None, ge=0, le=600)


class CampusUpdate(BaseModel):
    """Partial edit. Creation uses the router's own CampusUpsert, which
    requires the fields a campus cannot exist without."""
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    address: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)


class FloorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    level: Optional[int] = None


class AssetStateUpdate(BaseModel):
    state: AssetState
    reason: Optional[str] = None


class TwinEventOut(BaseModel):
    id: int
    kind: str
    entity_type: str
    entity_id: uuid.UUID
    room_id: Optional[uuid.UUID] = None
    payload: dict
    occurred_at: datetime
