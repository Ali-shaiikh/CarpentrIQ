"""merge_heads

Revision ID: 4a9b61d0d580
Revises: 08d17a8bc9f2, a3f91b2c4d5e
Create Date: 2026-05-03 11:47:39.187116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a9b61d0d580'
down_revision: Union[str, None] = ('08d17a8bc9f2', 'a3f91b2c4d5e')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
