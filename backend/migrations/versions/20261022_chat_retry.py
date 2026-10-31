"""Persist chat retry keys and credit reservations without changing existing data."""

import sqlalchemy as sa
from alembic import op

from app.core.database import UTCDateTime

revision = "20261022_chat_retry"
down_revision = "20261010_mysql_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_requests",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column("conversation_id", sa.String(36), nullable=False),
        sa.Column("chatbot_id", sa.String(36), nullable=False),
        sa.Column("client_message_id", sa.String(36), nullable=False),
        sa.Column("message_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempt_token", sa.String(36), nullable=False),
        sa.Column("lease_until", UTCDateTime(), nullable=False),
        sa.Column("credit_source", sa.String(10), nullable=True),
        sa.Column("remaining_credits", sa.Integer(), nullable=False),
        sa.Column("response_data", sa.JSON(), nullable=True),
        sa.Column("created_at", UTCDateTime(), nullable=False),
        sa.Column("updated_at", UTCDateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "client_message_id"),
    )
    for column in ("organization_id", "conversation_id", "chatbot_id"):
        op.create_index(f"ix_chat_requests_{column}", "chat_requests", [column])
    op.create_index(
        "ix_chat_requests_recovery", "chat_requests", ["organization_id", "status", "lease_until"]
    )


def downgrade() -> None:
    op.drop_table("chat_requests")
