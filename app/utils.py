"""Shared utility helpers."""

from __future__ import annotations


def format_dimension(mm: int | float) -> str:
    """Return a dimension string in mm, inches, and feet.

    Example: format_dimension(1800) → "1800 mm / 70.9 in / 5.9 ft"
    """
    inches = mm / 25.4
    feet = mm / 304.8
    return f"{int(mm)} mm / {inches:.1f} in / {feet:.1f} ft"


def format_dimensions(width_mm: int | float, height_mm: int | float, depth_mm: int | float) -> str:
    """Return W × H × D in all three units on one line.

    Example: "W 1800 mm / 70.9 in / 5.9 ft  ×  H 2100 mm / 82.7 in / 6.9 ft  ×  D 580 mm / 22.8 in / 1.9 ft"
    """
    return (
        f"W {format_dimension(width_mm)}"
        f"  ×  H {format_dimension(height_mm)}"
        f"  ×  D {format_dimension(depth_mm)}"
    )
