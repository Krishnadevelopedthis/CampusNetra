from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HistoryEntryOut(BaseModel):
    id: str
    action: str
    description: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    entity_reference: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryOut(BaseModel):
    entries: list[HistoryEntryOut]
