"""add_homeowners_table

Revision ID: f7e2a1b3c8d9
Revises: 4a9b61d0d580
Create Date: 2026-05-04 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f7e2a1b3c8d9"
down_revision: Union[str, None] = "4a9b61d0d580"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "homeowners",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("phone", sa.VARCHAR(15), unique=True, nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("city", sa.VARCHAR(50), server_default="Mumbai"),
        sa.Column("plan", sa.VARCHAR(20), server_default="trial"),
        sa.Column(
            "trial_ends_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW() + INTERVAL '14 days'"),
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index("ix_homeowners_phone", "homeowners", ["phone"])


def downgrade() -> None:
    op.drop_index("ix_homeowners_phone", table_name="homeowners")
    op.drop_table("homeowners")
