from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AdminSummary(BaseModel):
    organizations: int
    users: int
    chatbots: int
    conversations: int
    leads: int
    documents_processing: int
    payments_pending: int


class AdminOrganization(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime


class OrganizationStateUpdate(BaseModel):
    is_active: bool
