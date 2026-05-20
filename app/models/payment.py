"""Payment model — Razorpay advance / final / partial payments."""

import uuid
from datetime import datetime

from sqlalchemy import NUMERIC, TIMESTAMP, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=True
    )
    carpenter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carpenters.id"), nullable=True
    )
    razorpay_payment_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[float | None] = mapped_column(NUMERIC(10, 2), nullable=True)
    payment_type: Mapped[str | None] = mapped_column(Text, nullable=True)  # advance|final|partial
    status: Mapped[str] = mapped_column(Text, default="pending")  # pending|captured|failed|refunded
    paid_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
