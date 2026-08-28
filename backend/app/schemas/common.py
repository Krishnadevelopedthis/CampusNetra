"""Shared response envelopes and primitives."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int

    @property
    def pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size if self.page_size else 0


class Message(BaseModel):
    detail: str


class IdResponse(BaseModel):
    id: uuid.UUID
    reference: Optional[str] = None


class UserBrief(ORMModel):
    """Minimal user shape embedded in lists — never leaks the password hash."""
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    designation: Optional[str] = None
