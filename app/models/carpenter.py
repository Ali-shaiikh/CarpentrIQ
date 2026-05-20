"""Carpenter account model."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import ARRAY, Boolean, Integer, NUMERIC, TIMESTAMP, Text, text, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Carpenter(Base):
    __tablename__ = "carpenters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(Text, default="Mumbai")
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    whatsapp_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    speciality: Mapped[list[str] | None] = mapped_column(ARRAY(Text), nullable=True)
    experience: Mapped[str | None] = mapped_column(Text, nullable=True)      # "1-3"|"3-7"|"7-15"|"15+"
    labour_rate_sqft: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    upi_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── legacy plan field (kept for backwards compat) ─────────────────────────
    plan: Mapped[str] = mapped_column(Text, default="trial")  # trial|basic|pro

    # ── trial ─────────────────────────────────────────────────────────────────
    trial_started_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
    trial_ends_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        default=lambda: datetime.now(timezone.utc) + timedelta(days=10),
    )
    is_trial_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── subscription ──────────────────────────────────────────────────────────
    subscription_plan: Mapped[str] = mapped_column(Text, default="free_trial")
    subscription_started_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    subscription_expires_at: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    razorpay_subscription_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_payment_date: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    next_payment_date: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    auto_renew_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── monthly usage quotas ──────────────────────────────────────────────────
    images_used_this_month: Mapped[int] = mapped_column(Integer, default=0)
    images_limit_this_month: Mapped[int] = mapped_column(Integer, default=20)
    quotes_sent_this_month: Mapped[int] = mapped_column(Integer, default=0)
    quotes_sent_limit_this_month: Mapped[int] = mapped_column(Integer, default=3)
    regenerates_used_this_month: Mapped[int] = mapped_column(Integer, default=0)
    regenerates_free_limit: Mapped[int] = mapped_column(Integer, default=5)

    # ── lifetime stats ────────────────────────────────────────────────────────
    quote_link_slug: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    total_quotes_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_revenue_processed: Mapped[float] = mapped_column(NUMERIC(14, 2), default=0)
    pdf_credits_remaining: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
