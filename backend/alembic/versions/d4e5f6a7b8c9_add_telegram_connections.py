"""add telegram connections

Revision ID: d4e5f6a7b8c9
Revises: c3f4a1b2d6e7
Create Date: 2026-09-22 02:20:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3f4a1b2d6e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "telegram_connections",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("chat_id", sa.String(length=100), nullable=True),
        sa.Column("pending_chat_id", sa.String(length=100), nullable=True),
        sa.Column("verification_digest", sa.String(length=64), nullable=True),
        sa.Column("verification_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            name=op.f("fk_telegram_connections_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_telegram_connections")),
    )
    op.create_index(
        op.f("ix_telegram_connections_organization_id"),
        "telegram_connections",
        ["organization_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_telegram_connections_organization_id"), table_name="telegram_connections"
    )
    op.drop_table("telegram_connections")
