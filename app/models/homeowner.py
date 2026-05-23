"""Homeowner (client) account model."""

import uuid
from datetime import datetime

from sqlalchemy import TIMESTAMP, VARCHAR, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Homeowner(Base):
    __tablename__ = "homeowners"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    phone: Mapped[str] = mapped_column(VARCHAR(15), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(VARCHAR(50), server_default="Mumbai")
    plan: Mapped[str] = mapped_column(VARCHAR(20), server_default="trial")
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=text("NOW() + INTERVAL '14 days'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
