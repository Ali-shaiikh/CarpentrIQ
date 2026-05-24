"""Catalogue router — furniture types with 3D model URLs.

Endpoints (public):
  GET /catalogue              — all active items
  GET /catalogue/:item_type   — single item with default config
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.material import FurnitureCatalogue

router = APIRouter()


def _to_dict(item: FurnitureCatalogue) -> dict:
    return {
        "id": str(item.id),
        "item_type": item.item_type,
        "display_name": item.display_name,
        "default_config": item.default_config,
        "glb_model_url": item.glb_model_url,
        "thumbnail_url": item.thumbnail_url,
        "sort_order": item.sort_order,
    }


@router.get("")
async def list_catalogue(db: AsyncSession = Depends(get_db)) -> list:
    result = await db.execute(
        select(FurnitureCatalogue)
        .where(FurnitureCatalogue.is_active)
        .order_by(FurnitureCatalogue.sort_order)
    )
    return [_to_dict(item) for item in result.scalars().all()]


@router.get("/{item_type}")
async def get_catalogue_item(
    item_type: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(FurnitureCatalogue).where(FurnitureCatalogue.item_type == item_type)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail=f"Catalogue item '{item_type}' not found")
    return _to_dict(item)
