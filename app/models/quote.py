"""FurnitureItem and Quote models."""

import uuid
from datetime import datetime

from sqlalchemy import NUMERIC, TIMESTAMP, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FurnitureItem(Base):
    __tablename__ = "furniture_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False
    )
    item_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )  # {width_mm, height_mm, depth_mm, doors, drawers, finish}
    material_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    material_cost: Mapped[float | None] = mapped_column(NUMERIC(10, 2), nullable=True)
    labour_cost: Mapped[float | None] = mapped_column(NUMERIC(10, 2), nullable=True)
    margin_pct: Mapped[float | None] = mapped_column(NUMERIC(4, 2), nullable=True)
    final_price: Mapped[float | None] = mapped_column(NUMERIC(10, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False
    )
    carpenter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carpenters.id"), nullable=False
    )
    quote_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_items: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    subtotal: Mapped[float | None] = mapped_column(NUMERIC(12, 2), nullable=True)
    tax_amount: Mapped[float] = mapped_column(NUMERIC(10, 2), default=0)
    total_amount: Mapped[float | None] = mapped_column(NUMERIC(12, 2), nullable=True)
    advance_requested: Mapped[float | None] = mapped_column(NUMERIC(10, 2), nullable=True)
    validity_days: Mapped[int] = mapped_column(SmallInteger, default=7)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="sent")
    # draft|sent|viewed|approved|rejected|expired
    viewed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    razorpay_payment_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    share_token: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
