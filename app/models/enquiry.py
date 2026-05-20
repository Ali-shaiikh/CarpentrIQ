"""Enquiry, EnquiryPhoto, and CVResult models."""

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, NUMERIC, TIMESTAMP, ForeignKey, SmallInteger, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Enquiry(Base):
    __tablename__ = "enquiries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    carpenter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("carpenters.id", ondelete="CASCADE"), nullable=False
    )
    client_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    room_type: Mapped[str | None] = mapped_column(Text, nullable=True)  # bedroom|living|kitchen|dining|study
    furniture_needed: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    room_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="new")
    # new|photos_uploaded|quoted|approved|in_progress|completed
    share_token: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )


class EnquiryPhoto(Base):
    __tablename__ = "enquiry_photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    enquiry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enquiries.id", ondelete="CASCADE"), nullable=False
    )
    storage_url: Mapped[str] = mapped_column(Text, nullable=False)
    image_hash: Mapped[str | None] = mapped_column(Text, nullable=True)  # SHA256
    photo_type: Mapped[str | None] = mapped_column(Text, nullable=True)  # room|detail|reference
    upload_order: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )


class CVResult(Base):
    """YOLOv8 CV output — cached by image_hash, never reprocessed for the same image."""

    __tablename__ = "cv_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    image_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    enquiry_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("enquiry_photos.id"), nullable=True
    )
    room_width_mm: Mapped[int | None] = mapped_column(nullable=True)
    room_length_mm: Mapped[int | None] = mapped_column(nullable=True)
    room_height_mm: Mapped[int | None] = mapped_column(nullable=True)
    confidence_score: Mapped[float | None] = mapped_column(NUMERIC(4, 2), nullable=True)
    detected_objects: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_yolo_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
