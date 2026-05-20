"""add carpenter_portfolio and carpenter_reviews tables

Revision ID: a3f91b2c4d5e
Revises: 6b481421f024
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a3f91b2c4d5e"
down_revision = "6b481421f024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "carpenter_portfolio",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("carpenter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("carpenters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("image_url", sa.Text, nullable=False),
        sa.Column("storage_path", sa.Text, nullable=True),
        sa.Column("caption", sa.Text, nullable=True),
        sa.Column("item_type", sa.Text, nullable=True),
        sa.Column("upload_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("ix_carpenter_portfolio_carpenter_id", "carpenter_portfolio", ["carpenter_id"])

    op.create_table(
        "carpenter_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("carpenter_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("carpenters.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotes.id"), nullable=True),
        sa.Column("client_name", sa.Text, nullable=False),
        sa.Column("client_phone", sa.Text, nullable=True),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("review_text", sa.Text, nullable=True),
        sa.Column("is_verified", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("ix_carpenter_reviews_carpenter_id", "carpenter_reviews", ["carpenter_id"])


def downgrade() -> None:
    op.drop_table("carpenter_reviews")
    op.drop_table("carpenter_portfolio")
