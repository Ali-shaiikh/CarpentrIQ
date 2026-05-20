"""MaterialPrice, FurnitureCatalogue, and Job models."""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, BOOLEAN, NUMERIC, TIMESTAMP, DATE, ForeignKey, SmallInteger, Text, text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MaterialPrice(Base):
    """Regional material prices — updated monthly by founder via seed script."""

    __tablename__ = "material_prices"
    __table_args__ = (UniqueConstraint("material_type", "brand", "city"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. plywood_bwp_8x4 | mdf_18mm | laminate_sqft
    brand: Mapped[str | None] = mapped_column(Text, nullable=True)  # Century | Greenply | Merino | Generic
    city: Mapped[str | None] = mapped_column(Text, nullable=True)
    price_inr: Mapped[float | None] = mapped_column(NUMERIC(8, 2), nullable=True)
    unit: Mapped[str | None] = mapped_column(Text, nullable=True)  # sheet | sqft | piece | metre
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()"), onupdate=text("NOW()")
    )


class FurnitureCatalogue(Base):
    """Indian furniture catalogue with 3D GLB model references."""

    __tablename__ = "furniture_catalogue"
    __table_args__ = (UniqueConstraint("item_type"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    glb_model_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # free GLB only — v1
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(BOOLEAN, default=True)
    sort_order: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )


class Job(Base):
    """Job progress tracking after quote is approved."""

    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quote_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quotes.id"), nullable=True
    )
    carpenter_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carpenters.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(Text, default="not_started")
    start_date: Mapped[datetime | None] = mapped_column(DATE, nullable=True)
    expected_end_date: Mapped[datetime | None] = mapped_column(DATE, nullable=True)
    actual_end_date: Mapped[datetime | None] = mapped_column(DATE, nullable=True)
    progress_photos: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    carpenter_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    balance_payment_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
