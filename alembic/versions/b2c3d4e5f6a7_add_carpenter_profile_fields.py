"""add business profile fields to carpenters

Revision ID: b2c3d4e5f6a7
Revises: ad9e6f751b04
Create Date: 2026-05-06 00:00:00.000000

business_name  — shop/trade name (e.g. "Ramesh Furniture Works"), shown on quote PDFs
experience     — years bracket ("1-3"|"3-7"|"7-15"|"15+")
labour_rate_sqft — carpenter's own rate, overrides the global default in quotes
upi_id         — UPI ID for advance payment collection shown on quote PDF
bio            — one-liner shown on their public profile
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'ad9e6f751b04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("carpenters", sa.Column("business_name", sa.Text(), nullable=True))
    op.add_column("carpenters", sa.Column("experience", sa.Text(), nullable=True))
    op.add_column("carpenters", sa.Column("labour_rate_sqft", sa.Numeric(8, 2), nullable=True))
    op.add_column("carpenters", sa.Column("upi_id", sa.Text(), nullable=True))
    op.add_column("carpenters", sa.Column("bio", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("carpenters", "bio")
    op.drop_column("carpenters", "upi_id")
    op.drop_column("carpenters", "labour_rate_sqft")
    op.drop_column("carpenters", "experience")
    op.drop_column("carpenters", "business_name")
