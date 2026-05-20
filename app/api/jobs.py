"""Jobs router — start, update, complete, and list jobs.

Endpoints (all require JWT):
  POST /jobs/{quote_id}/start       — create job from approved quote
  POST /jobs/{job_id}/update        — append note + photos
  POST /jobs/{job_id}/complete      — mark done, create balance payment link
  GET  /jobs?status=active|completed
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.carpenter import Carpenter
from app.models.enquiry import Enquiry
from app.models.material import Job
from app.models.payment import Payment
from app.models.quote import Quote
from app.services.auth_service import auth_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_UPDATE_PHOTOS = 5


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_job(job_id: str, carpenter: Carpenter, db: AsyncSession) -> Job:
    result = await db.execute(
        select(Job).where(
            Job.id == job_id,
            Job.carpenter_id == carpenter.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def _enrich_job(job: Job, db: AsyncSession) -> dict:
    """Return job dict with client_name, furniture_list, days_remaining, etc."""
    quote = None
    enquiry = None
    if job.quote_id:
        q_res = await db.execute(select(Quote).where(Quote.id == job.quote_id))
        quote = q_res.scalar_one_or_none()
    if quote and quote.enquiry_id:
        e_res = await db.execute(select(Enquiry).where(Enquiry.id == quote.enquiry_id))
        enquiry = e_res.scalar_one_or_none()

    photos = job.progress_photos or []
    notes = job.carpenter_notes or ""

    days_remaining = None
    overdue = False
    if job.expected_end_date and job.status == "in_progress":
        delta = (job.expected_end_date - date.today()).days
        days_remaining = delta
        overdue = delta < 0

    last_note_preview = None
    if notes:
        lines = [l.strip() for l in notes.strip().splitlines() if l.strip()]
        for line in reversed(lines):
            if not line.startswith("["):
                last_note_preview = line[:80] + ("…" if len(line) > 80 else "")
                break
        if not last_note_preview and lines:
            text_part = lines[-1]
            if "]" in text_part:
                text_part = text_part.split("]", 1)[-1].strip()
            last_note_preview = text_part[:80] + ("…" if len(text_part) > 80 else "")

    return {
        "id": str(job.id),
        "quote_id": str(job.quote_id) if job.quote_id else None,
        "status": job.status,
        "start_date": job.start_date.isoformat() if job.start_date else None,
        "expected_end_date": job.expected_end_date.isoformat() if job.expected_end_date else None,
        "actual_end_date": job.actual_end_date.isoformat() if job.actual_end_date else None,
        "progress_photos": photos,
        "progress_photo_count": len(photos),
        "carpenter_notes": notes,
        "last_note_preview": last_note_preview,
        "balance_payment_link": job.balance_payment_link,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        # enriched
        "client_name": enquiry.client_name if enquiry else None,
        "client_phone": enquiry.client_phone if enquiry else None,
        "room_type": enquiry.room_type if enquiry else None,
        "furniture_list": enquiry.furniture_needed if enquiry else [],
        "total_amount": float(quote.total_amount or 0) if quote else 0,
        "advance_requested": float(quote.advance_requested or 0) if quote else 0,
        "days_remaining": days_remaining,
        "overdue": overdue,
    }


async def _create_balance_payment_link(job: Job, quote: Quote, enquiry: Enquiry | None) -> str | None:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        logger.warning("Razorpay not configured — skipping balance payment link")
        return None

    balance = float(quote.total_amount or 0) - float(quote.advance_requested or 0)
    if balance <= 0:
        return None

    balance_paise = int(balance * 100)
    furniture_str = ", ".join(enquiry.furniture_needed or []) if enquiry else "furniture"
    client_name = enquiry.client_name if enquiry else "client"
    description = f"Balance payment: {furniture_str} — {client_name}"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.razorpay.com/v1/payment_links",
                json={
                    "amount": balance_paise,
                    "currency": "INR",
                    "description": description[:255],
                    "notify": {"sms": False, "email": False},
                    "notes": {
                        "job_id": str(job.id),
                        "quote_id": str(job.quote_id),
                        "payment_type": "balance",
                    },
                },
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            )
            resp.raise_for_status()
            return resp.json()["short_url"]
    except Exception as exc:
        logger.error("Razorpay balance link creation failed: %s", exc)
        return None


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/{quote_id}/start", status_code=201)
async def start_job(
    quote_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Create a job from an approved quote."""
    q_res = await db.execute(
        select(Quote).where(Quote.id == quote_id, Quote.carpenter_id == carpenter.id)
    )
    quote = q_res.scalar_one_or_none()
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")
    if quote.status != "approved":
        raise HTTPException(status_code=400, detail="Quote must be approved before starting a job")

    # Prevent duplicate jobs
    existing = await db.execute(select(Job).where(Job.quote_id == quote.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A job for this quote already exists")

    job = Job(
        quote_id=quote.id,
        carpenter_id=carpenter.id,
        status="in_progress",
        start_date=date.today(),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return await _enrich_job(job, db)


class UpdateBody(BaseModel):
    notes: str = ""


@router.post("/{job_id}/update")
async def update_job(
    job_id: str,
    notes: str = Form(default=""),
    photos: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Append a timestamped note and upload up to 5 photos."""
    job = await _get_job(job_id, carpenter, db)

    if len(photos) > MAX_UPDATE_PHOTOS:
        raise HTTPException(status_code=422, detail=f"Maximum {MAX_UPDATE_PHOTOS} photos per update")

    # Append note with timestamp
    if notes.strip():
        ts = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M")
        entry = f"[{ts}] {notes.strip()}"
        job.carpenter_notes = (
            f"{job.carpenter_notes}\n{entry}" if job.carpenter_notes else entry
        )

    # Upload photos
    uploaded_urls: list[str] = []
    if photos:
        ts_int = int(datetime.now(timezone.utc).timestamp())
        for n, upload in enumerate(photos):
            file_bytes = await upload.read()
            content_type = (upload.content_type or "image/jpeg").lower()
            ext = "jpg" if "jpeg" in content_type or "jpg" in content_type else "png"
            path = f"{carpenter.id}/jobs/{job_id}/update_{ts_int}_{n}.{ext}"
            url = await storage_service.upload(file_bytes, path, content_type)
            uploaded_urls.append(url)

        current = list(job.progress_photos or [])
        current.extend(uploaded_urls)
        job.progress_photos = current

    await db.commit()
    await db.refresh(job)
    return await _enrich_job(job, db)


@router.post("/{job_id}/complete")
async def complete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> dict:
    """Mark job complete, create Razorpay balance payment link."""
    job = await _get_job(job_id, carpenter, db)

    if job.status == "completed":
        raise HTTPException(status_code=400, detail="Job is already completed")

    job.status = "completed"
    job.actual_end_date = date.today()

    # Fetch quote + enquiry to calculate balance
    enquiry = None
    quote = None
    if job.quote_id:
        q_res = await db.execute(select(Quote).where(Quote.id == job.quote_id))
        quote = q_res.scalar_one_or_none()
    if quote and quote.enquiry_id:
        e_res = await db.execute(select(Enquiry).where(Enquiry.id == quote.enquiry_id))
        enquiry = e_res.scalar_one_or_none()

    balance_link = None
    if quote:
        balance_link = await _create_balance_payment_link(job, quote, enquiry)
        job.balance_payment_link = balance_link

    # Record balance payment row
    if quote:
        balance = float(quote.total_amount or 0) - float(quote.advance_requested or 0)
        if balance > 0:
            payment = Payment(
                quote_id=quote.id,
                carpenter_id=carpenter.id,
                amount=balance,
                payment_type="final",
                status="pending",
            )
            db.add(payment)

    await db.commit()
    await db.refresh(job)
    enriched = await _enrich_job(job, db)
    return {
        "job": enriched,
        "balance_payment_link": balance_link,
        "balance": enriched["total_amount"] - enriched["advance_requested"],
    }


@router.get("")
async def list_jobs(
    status: str | None = Query(default=None, description="active or completed"),
    db: AsyncSession = Depends(get_db),
    carpenter: Carpenter = Depends(auth_service.get_current_carpenter),
) -> list:
    """List all jobs for the carpenter, optionally filtered by status."""
    q = select(Job).where(Job.carpenter_id == carpenter.id)

    if status == "active":
        q = q.where(Job.status == "in_progress")
    elif status == "completed":
        q = q.where(Job.status == "completed")

    q = q.order_by(Job.created_at.desc())
    result = await db.execute(q)
    jobs = result.scalars().all()

    return [await _enrich_job(j, db) for j in jobs]
