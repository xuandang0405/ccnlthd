from pydantic import BaseModel


class DashboardSummary(BaseModel):
    chatbot_count: int
    conversation_count: int
    message_count: int
    lead_count: int
    new_lead_count: int
    document_count: int
    current_plan: str
    daily_limit: int | None
    daily_used: int
