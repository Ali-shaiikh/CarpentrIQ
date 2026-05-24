"""Furniture prompt builder — converts furniture configs into DALL-E 3 prompt strings.

Each build_*_prompt() returns a short description of that furniture piece.
build_complete_image_prompt() combines them into a full room transformation prompt.
"""

from __future__ import annotations

import random

# Each style is a complete visual world — materials, palette, hardware, lighting, texture.
# Leading the prompt with this anchors the entire generation, not just the furniture label.
_DESIGNER_STYLES = [
    {
        "name": "Japandi Wabi-Sabi",
        "vision": (
            "Japandi wabi-sabi — natural solid oak with visible wood grain and finger-jointed edges, "
            "matte clay and warm white palette with terracotta accents, handleless joinery with "
            "shadow-gap reveals, soft bouclé and oat linen upholstery, warm incandescent glow from "
            "Japanese paper pendants, low-profile silhouettes with generous negative space, "
            "tactile imperfection celebrated as beauty"
        ),
        "wardrobe":  "floor-to-ceiling wardrobe in natural oak with shadow-gap handleless doors, matte clay interior, integrated warm LED reveal at top",
        "bed":       "low-platform bed in solid oak with slatted headboard, natural linen fitted cover, matte ceramic bedside pods",
        "sofa":      "low-arm sofa in chunky oat bouclé, solid oak legs, loose seat cushions with linen piping",
        "tv_unit":   "floating TV unit in matte oak with open-shelf niching and washi paper pendant above",
        "kitchen":   "handleless kitchen in matte clay with natural oak open shelving, honed limestone countertop, aged bronze tap",
        "study":     "solid oak desk with live-edge detail, linen pin-board above, rattan woven drawer faces",
        "default":   "natural solid oak, matte clay lacquer, handleless shadow-gap profile, warm linen texture",
    },
    {
        "name": "Luxury Italian Contemporary",
        "vision": (
            "Luxury Italian contemporary — high-gloss lacquer in deep forest green or midnight navy, "
            "razor-thin brushed brass inlay trim on all panel edges, vertical fluted panel detailing "
            "on door faces, book-matched marble surfaces with dramatic veining, integrated LED cove "
            "lighting inside cabinets and along plinths, bold architectural proportions with "
            "concealed push-to-open mechanisms, zero visible hardware"
        ),
        "wardrobe":  "full-height wardrobe in high-gloss midnight navy lacquer, vertical brass inlay channel on each door, interior LED strip, push-to-open",
        "bed":       "upholstered platform bed in deep bottle-green velvet, brass-detailed headboard frame, statement bedside with fluted brass leg",
        "sofa":      "deep-seat sofa in forest-green boucle with slim brass trim on arm profile, Italian sculptural silhouette",
        "tv_unit":   "floating TV unit in matte black lacquer with brass-inlaid fluted panel doors, backlit floating shelf above",
        "kitchen":   "handleless kitchen in gloss-lacquered deep green, brass rail hardware, Calacatta marble countertop, under-cabinet LED strip",
        "study":     "lacquered desk in deep navy with brass-trimmed leather inlay on surface, fluted panel modesty screen",
        "default":   "high-gloss lacquer, brushed brass inlay trim, fluted panel detailing, concealed push-to-open",
    },
    {
        "name": "Neo-Classical Grandeur",
        "vision": (
            "Neo-classical grandeur — hand-carved solid wood mouldings with guilloché border detail, "
            "deep-buttoned velvet upholstery in sapphire or burgundy, bevelled mirror inserts with "
            "gilded frame reveals, aged gold hardware with acanthus leaf casting, "
            "warm amber chandelier lighting, rich jewel-tone palette with cream and ivory accents, "
            "symmetrical composition with classical proportions"
        ),
        "wardrobe":  "wardrobe with carved wood cornice, gilded moulding border on each door, bevelled mirror panel inserts, aged brass oval handles",
        "bed":       "four-poster bed with carved teak posts, deep-buttoned velvet headboard in burgundy, gilded carved bedframe detail",
        "sofa":      "chesterfield sofa in sapphire velvet with deep button-tufting, rolled arms, carved solid wood feet in antique gold finish",
        "tv_unit":   "TV console with carved wood pilaster columns, gilded moulding detail, aged brass ring-pull handles, cream lacquer body",
        "kitchen":   "shaker-profile kitchen in cream with gilded brass cup handles, carved wood cornice, marble countertop with ogee edge",
        "study":     "writing desk with carved cabriole legs, tooled leather inset top, gilded brass inkwell recesses",
        "default":   "hand-carved wood mouldings, deep-buttoned velvet, gilded brass hardware, bevelled mirror inserts",
    },
    {
        "name": "Art Deco Revival",
        "vision": (
            "Art Deco revival — geometric marquetry inlays in contrasting ebony and ivory veneer, "
            "bold fan and sunburst motifs on door faces, polished chrome and matte black lacquer "
            "combination, jewel-tone palette of emerald, amber, and jet black, "
            "stepped architectural silhouettes with strong vertical lines, "
            "glamorous mirrored surfaces and chrome trim details"
        ),
        "wardrobe":  "wardrobe with stepped cornice silhouette, ebony and ivory marquetry fan inlay on door faces, polished chrome bar handles",
        "bed":       "platform bed with stepped geometric headboard in black lacquer, amber veneer inlay panels, chrome side rail detail",
        "sofa":      "low-arm sofa in emerald velvet with geometric bolster cushions, chrome-plated leg detail, bold stepped arm profile",
        "tv_unit":   "TV unit with stepped risers, ebony lacquer body with ivory veneer geometric inlay, chrome pulls",
        "kitchen":   "kitchen in jet black with chrome bar handles, geometric mosaic tile splashback, contrasting ivory countertop",
        "study":     "desk in ebony lacquer with geometric chrome inlay on top surface, stepped chrome legs, mirrored back panel",
        "default":   "geometric marquetry in ebony and ivory veneer, polished chrome hardware, stepped architectural silhouette",
    },
    {
        "name": "Moody Dark Luxe",
        "vision": (
            "Moody dark luxe — smoked charcoal oak veneer with wire-brush texture, "
            "charcoal velvet and aged cognac leather upholstery, gunmetal and oxidised brass hardware, "
            "dramatic dark palette of charcoal, slate, and deep terracotta accents, "
            "warm directional lighting creating deep shadows and intimate atmosphere, "
            "statement proportions with a raw, sensual quality"
        ),
        "wardrobe":  "full-height wardrobe in wire-brushed smoked oak, charcoal body, oxidised brass bar handles, internal warm LED reveal",
        "bed":       "platform bed upholstered in charcoal velvet, cognac leather piping on headboard, smoked oak plinth base",
        "sofa":      "deep-seat sofa in charcoal velvet with cognac leather cushion piping, smoked oak tapered legs",
        "tv_unit":   "TV unit in wire-brushed charcoal oak with open niching, oxidised brass legs, dark marble slab top",
        "kitchen":   "kitchen in matte charcoal with wire-brushed smoked oak open shelves, oxidised brass hardware, dark soapstone countertop",
        "study":     "desk in smoked oak with leather-wrapped edges, oxidised brass pen tray, dark slate desktop",
        "default":   "wire-brushed smoked oak, charcoal velvet, oxidised brass hardware, warm intimate lighting",
    },
    {
        "name": "Mid-Century Modern",
        "vision": (
            "Mid-century modern — tapered solid walnut legs on all pieces, organic curves meeting "
            "precise geometric carcass forms, warm amber walnut veneer with visible grain, "
            "upholstery in mustard, rust, or teal wool fabric, "
            "statement brass and ceramic light fixtures, retro palette of warm whites and earthy ochre, "
            "clean joinery with visible wood peg detail"
        ),
        "wardrobe":  "wardrobe on tapered solid walnut legs, warm walnut veneer door faces, inset brass bar pulls, floating off-floor silhouette",
        "bed":       "platform bed on tapered walnut legs, curved organic headboard in mustard wool, walnut veneer bedside tables on matching legs",
        "sofa":      "sofa in rust or mustard wool upholstery, solid walnut tapered legs, button-free cushions with piped edge, organic silhouette",
        "tv_unit":   "sideboard-style TV unit on tapered walnut legs with sliding tambour or cane-front doors, brass recessed pulls",
        "kitchen":   "kitchen with warm walnut veneer upper cabinets, matte white lower cabinets, tapered wooden legs on island, brass fixtures",
        "study":     "kidney-shaped desk in walnut veneer on hairpin-style walnut legs, integrated leather pull-out tray",
        "default":   "tapered solid walnut legs, warm walnut veneer, mustard or rust upholstery, brass hardware",
    },
    {
        "name": "Coastal Organic",
        "vision": (
            "Coastal organic — cerused or bleached teak with open-grain texture, "
            "natural rope and rattan woven panel accents, soft white-wash and driftwood palette "
            "with ocean blue and sand accents, linen and stonewashed cotton upholstery, "
            "natural light amplified by white-painted walls, "
            "relaxed layered textiles and organic forms without sharp corners"
        ),
        "wardrobe":  "wardrobe in cerused white-wash teak, woven rattan insert panels on door faces, rope-wrapped handles",
        "bed":       "bed in bleached teak frame with woven rattan headboard panel, white linen bedding, driftwood textured bedside tables",
        "sofa":      "sofa in stone-washed linen slipcover, bleached teak frame, natural rope arm accent detail, loose cushion pile",
        "tv_unit":   "media console in cerused teak with woven cane-front doors, rope handle pulls, sandy linen basket inserts on open shelf",
        "kitchen":   "kitchen in white-painted shaker profile with cerused teak open shelves, rope-pull drawers, white quartz countertop",
        "study":     "bleached teak desk with woven rattan modesty panel, rope-wrapped pull, natural linen-covered pinboard",
        "default":   "cerused bleached teak, woven rattan panel inserts, rope accents, stone-washed linen upholstery",
    },
    {
        "name": "Maximalist Jewel Box",
        "vision": (
            "Maximalist jewel box — oversized scale with deep jewel tones of peacock teal, "
            "saffron, and magenta, deep-buttoned velvet upholstery in contrasting statement colour, "
            "gilded and lacquered surfaces mixing in one piece, "
            "richly layered textures of velvet, silk cushions, and patterned rugs, "
            "statement chandelier, bold brass and gold hardware everywhere, "
            "fearless pattern-mixing and maximalist layering"
        ),
        "wardrobe":  "oversized wardrobe in lacquered peacock teal with gilded border moulding, deep-buttoned velvet-lined interior, ornate brass handles",
        "bed":       "upholstered bed in saffron velvet with deep-button tufted headboard to ceiling height, gilded frame, silk bolster cushions",
        "sofa":      "oversized chesterfield in peacock velvet, contrasting magenta cushions, gilded carved legs, fringe trim on base",
        "tv_unit":   "lacquered TV cabinet in deep teal with gilded carved pilasters, velvet-lined display shelves, ornate brass ring pulls",
        "kitchen":   "kitchen in lacquered saffron yellow with gilded moulding rails, patterned encaustic tile splashback, brass hardware everywhere",
        "study":     "lacquered desk in jewel-toned emerald with gilded brass knob handles, velvet upholstered chair in contrasting peacock",
        "default":   "jewel-tone lacquer, deep-buttoned velvet, gilded brass hardware, maximalist layered textures",
    },
    {
        "name": "Industrial Loft",
        "vision": (
            "Industrial loft — raw blackened iron frames with visible weld detail, "
            "aged tobacco leather panels and cushions with saddle-stitch edging, "
            "reclaimed elm or pine with natural crack and knot retained, "
            "exposed hex-bolt and rivet detailing as decorative element, "
            "Edison filament bulb pendants and track spotlights, "
            "dark palette of iron, charcoal, and deep tobacco with concrete-effect surfaces"
        ),
        "wardrobe":  "wardrobe with blackened iron frame and reclaimed elm panel doors, Edison bulb interior strip, hex-bolt corner brackets",
        "bed":       "bed on blackened iron frame with aged tobacco leather padded headboard, saddle-stitch edging, reclaimed wood plinth",
        "sofa":      "sofa in aged tobacco leather with saddle-stitch detailing, blackened iron visible frame, rivet arm-cap detail",
        "tv_unit":   "TV console in reclaimed elm on blackened iron hairpin frame, open shelf with Edison bulb table lamp, rivet detailing",
        "kitchen":   "kitchen with blackened iron open shelving, reclaimed wood lower cabinet doors, concrete-effect countertop, hex-bolt handles",
        "study":     "desk in reclaimed elm plank on blackened iron trestle frame, leather-strap cable management, visible bolt joinery",
        "default":   "blackened iron frame, aged tobacco leather, reclaimed elm, exposed weld and rivet detail",
    },
    {
        "name": "Grandmillennial Chinoiserie",
        "vision": (
            "Grandmillennial chinoiserie — hand-painted lacquer panel doors with botanical bird-and-flower motif, "
            "antique brass hardware with porcelain pulls, cane webbing inserts on cabinet faces, "
            "high-contrast ivory and deep lacquer colour pairing, "
            "antique brass picture light above artwork panels, "
            "layered chinoiserie print textiles, rattan and antique brass accent details"
        ),
        "wardrobe":  "wardrobe with lacquered panel doors hand-painted in chinoiserie botanical motif, cane webbing lower section, antique brass drop handles",
        "bed":       "bed with tufted headboard in chinoiserie print fabric, antique brass bedframe trim, cane webbing bedside table panels",
        "sofa":      "sofa in chinoiserie botanical print fabric, antique brass turned legs, cane webbing back panel, ivory fringe trim",
        "tv_unit":   "TV cabinet in high-gloss ivory lacquer with hand-painted chinoiserie motif on door faces, antique brass ring pulls",
        "kitchen":   "kitchen in ivory shaker profile with antique brass cup handles, hand-painted tile splashback, rattan-front drawer inserts",
        "study":     "desk in ivory lacquer with chinoiserie botanical motif on return panel, antique brass knob handles, rattan chair",
        "default":   "chinoiserie lacquer panel, cane webbing inserts, antique brass hardware, botanical hand-painted motif",
    },
    {
        "name": "Warm Organic Modern",
        "vision": (
            "Warm organic modern — travertine and warm plaster textures meeting curved solid wood forms, "
            "terracotta, warm clay, and dusty rose palette with sage accents, "
            "curved edges on all furniture — no sharp corners anywhere, "
            "limewash plaster wall finish, arched alcoves, fluted plaster details, "
            "natural fiber rugs and handthrown ceramic accessories, "
            "warm diffused ambient light, no harsh shadows"
        ),
        "wardrobe":  "wardrobe with curved-edge door profiles in warm clay lacquer, arched plinth, fluted plaster-look panel between units, recessed LED top",
        "bed":       "platform bed with rounded curved headboard upholstered in dusty rose boucle, curved solid timber bed legs, arched bedside niche",
        "sofa":      "curved sectional sofa with rounded arms in terracotta bouclé, no visible legs, continuous curved silhouette",
        "tv_unit":   "curved TV unit in warm clay with arched open niching, limewash plaster-textured finish, handthrown ceramic accessories",
        "kitchen":   "kitchen with curved corner profiles in warm white plaster-finish, arched range hood, terracotta zellige tile splashback, warm brass tap",
        "study":     "curved-edge desk in warm clay lacquer with arched leg cutout, bouclé desk chair, handthrown ceramic pen holder",
        "default":   "curved edges throughout, warm clay lacquer, bouclé and linen upholstery, travertine and plaster textures",
    },
    {
        "name": "Minimal Luxury",
        "vision": (
            "Minimal luxury — seamless book-matched veneer panels with invisible joinery, "
            "handleless floor-to-ceiling cabinetry with motorised soft-close, "
            "micro-cement and honed travertine surfaces, "
            "ivory, warm grey, and pale almond palette with no pattern or print, "
            "recessed linear LED lighting integrated into every horizontal surface, "
            "gallery-white walls, materials doing all the talking — zero decoration"
        ),
        "wardrobe":  "seamless floor-to-ceiling wardrobe in book-matched warm walnut veneer, motorised push-to-open, recessed LED plinth and top reveal",
        "bed":       "ultra-low platform bed in honed travertine plinth, upholstered top in ivory bouclé, no visible legs, integrated bedside surface",
        "sofa":      "deep modular sofa in pale almond bouclé, no visible frame, flush tight-back cushions, seamless sectional silhouette",
        "tv_unit":   "flush floor-to-ceiling media wall in book-matched veneer, integrated TV recess, linear LED reveal, no visible handles",
        "kitchen":   "seamless handleless kitchen in warm grey micro-cement finish, integrated hob and sink, honed travertine countertop, no visible gaps",
        "study":     "seamless floating desk in book-matched veneer, integrated monitor arm channel, recessed LED underlit surface",
        "default":   "book-matched veneer, seamless invisible joinery, handleless, recessed linear LED, honed travertine surfaces",
    },
]


_PREMIUM_MODERN_STYLES = frozenset({
    "Minimal Luxury",
    "Luxury Italian Contemporary",
    "Japandi Wabi-Sabi",
    "Warm Organic Modern",
    "Mid-Century Modern",
    "Moody Dark Luxe",
})


def _pick_style(material_grade: str = "standard", forced_name: str | None = None) -> dict:
    """Return a designer style dict. If forced_name matches a style, use it; else pick randomly."""
    if forced_name:
        match = next((s for s in _DESIGNER_STYLES if s["name"] == forced_name), None)
        if match:
            return match
    if material_grade != "budget":
        premium = [s for s in _DESIGNER_STYLES if s["name"] in _PREMIUM_MODERN_STYLES]
        if premium and random.random() < 0.80:
            return random.choice(premium)
    return random.choice(_DESIGNER_STYLES)


DESIGNER_STYLE_NAMES: list[str] = [s["name"] for s in _DESIGNER_STYLES]

# Maps room type → keys to pull from the style dict for default furniture.
# Used when no furniture items are specified — keeps furniture style-coherent.
_ROOM_STYLE_KEYS: dict[str, list[str]] = {
    "bedroom":  ["bed", "wardrobe"],
    "living":   ["sofa", "tv_unit"],
    "kitchen":  ["kitchen"],
    "study":    ["study"],
    "dining":   [],   # no style keys — falls back to generic
    "bathroom": [],
    "balcony":  [],
    "pooja":    [],
    "foyer":    [],
    "passage":  [],
}

# Phrases that mean "leave the furniture alone" — only these skip replacement.
_KEEP_FURNITURE_PHRASES = (
    "keep furniture",
    "keep existing furniture",
    "keep the furniture",
    "don't change furniture",
    "do not change furniture",
    "preserve furniture",
    "same furniture",
    "no furniture change",
    "keep sofa",
    "keep the sofa",
    "retain furniture",
)


def _preserve_furniture(notes: str) -> bool:
    """Return True only if notes explicitly ask to keep existing furniture unchanged."""
    if not notes:
        return False
    lower = notes.lower()
    return any(phrase in lower for phrase in _KEEP_FURNITURE_PHRASES)


GRADE_MATERIAL = {
    "budget":   "melamine-finish MDF, basic chrome hardware",
    "standard": "natural wood veneer on BWP plywood, soft-close fittings, brushed brass hardware",
    "premium":  "solid wood or book-matched veneer, concealed hinges, premium hardware, luxury finish",
}

# Alias kept for backward compatibility with all builder functions
GRADE_STYLE = GRADE_MATERIAL


def _mm_to_ft(mm: int | float) -> str:
    feet = mm / 304.8
    return f"{feet:.1f}ft"


def build_wardrobe_prompt(config: dict) -> str:
    w = config.get("width_mm", 2400)
    h = config.get("height_mm", 2100)
    doors = config.get("num_doors", config.get("doors", 2))
    door_type = config.get("door_type", "hinged")
    drawers = config.get("num_drawers", config.get("drawers", 0))
    loft = config.get("has_loft", False)
    grade = config.get("material_grade", "standard")

    parts = [
        f"{_mm_to_ft(w)} wide {_mm_to_ft(h)} tall {door_type} wardrobe",
        f"{doors}-door",
    ]
    if drawers:
        parts.append(f"{drawers} drawers")
    if loft:
        parts.append("with overhead loft unit")
    parts.append(GRADE_STYLE.get(grade, GRADE_STYLE["standard"]))
    return ", ".join(parts)


def build_sofa_prompt(config: dict) -> str:
    shape = config.get("shape", "L-shape")
    seaters = config.get("seaters", 3)
    material = config.get("upholstery", "fabric")
    colour = config.get("colour", "neutral grey")
    return f"{shape} {seaters}-seater sofa, {material} upholstery, {colour}, contemporary Indian living room style"


def build_tv_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 1800)
    shutters = config.get("shutters", 4)
    has_wall = config.get("has_wall_unit", True)
    grade = config.get("material_grade", "standard")

    parts = [f"{_mm_to_ft(w)} wide TV unit with {shutters} shutters"]
    if has_wall:
        parts.append("matching floating wall shelves above")
    parts.append(GRADE_STYLE.get(grade, GRADE_STYLE["standard"]))
    return ", ".join(parts)


def build_kitchen_prompt(config: dict) -> str:
    layout = config.get("layout", "L")
    base_len = config.get("base_length_mm", 3000)
    drawers = config.get("num_drawers", config.get("drawers", 3))
    baskets = config.get("num_baskets", config.get("baskets", 4))
    grade = config.get("material_grade", "standard")

    layout_label = {
        "L": "L-shape", "U": "U-shape", "straight": "straight", "island": "island"
    }.get(layout, layout)

    parts = [
        f"{layout_label} modular kitchen, {_mm_to_ft(base_len)} base counter",
        f"{drawers} drawers, {baskets} pull-out baskets",
        "granite or quartz countertop",
        GRADE_STYLE.get(grade, GRADE_STYLE["standard"]),
    ]
    return ", ".join(parts)


def build_study_table_prompt(config: dict) -> str:
    w = config.get("width_mm", 1200)
    overhead = config.get("has_overhead", False)
    grade = config.get("material_grade", "standard")

    parts = [f"{_mm_to_ft(w)} wide study table with bookshelf"]
    if overhead:
        parts.append("overhead storage shelves")
    parts.append(GRADE_STYLE.get(grade, GRADE_STYLE["standard"]))
    return ", ".join(parts)


def build_bed_prompt(config: dict) -> str:
    w = config.get("width_mm", 1800)
    storage = config.get("has_storage", False)
    grade = config.get("material_grade", "standard")

    size_label = "queen" if w >= 1600 else "double"
    parts = [f"{size_label} size platform bed with upholstered headboard"]
    if storage:
        parts.append("hydraulic storage lift mechanism")
    parts.append(GRADE_STYLE.get(grade, GRADE_STYLE["standard"]))
    return ", ".join(parts)


def build_vanity_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 900)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide under-sink vanity cabinet with drawers, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_mirror_cabinet_prompt(config: dict) -> str:
    w = config.get("width_mm", 750)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide mirror cabinet with internal storage shelves, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_bathroom_linen_tower_prompt(config: dict) -> str:
    grade = config.get("material_grade", "standard")
    return f"tall bathroom linen tower with shelves and door cabinet, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_balcony_seating_prompt(config: dict) -> str:
    return "outdoor balcony bench with storage below, weather-resistant wood or WPC finish, cushioned seating"


def build_planter_box_prompt(config: dict) -> str:
    return "custom planter boxes with raised garden bed, teak or WPC slats, tiered arrangement"


def build_pooja_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 900)
    h = config.get("height_mm", 1800)
    grade = config.get("material_grade", "standard")
    return (
        f"{_mm_to_ft(w)} wide {_mm_to_ft(h)} tall pooja unit with carved arch, LED strip backlight, "
        f"marble shelf, storage cabinet below, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"
    )


def build_pooja_storage_prompt(config: dict) -> str:
    grade = config.get("material_grade", "standard")
    return f"pooja storage shelves with glass-fronted display cabinet and drawer unit, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_shoe_cabinet_prompt(config: dict) -> str:
    w = config.get("width_mm", 1200)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide shoe cabinet with tilt-out shoe trays and closed storage above, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_console_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 1000)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide console table with key hooks, small drawer, and floating shelf above, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_bookshelf_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 1200)
    h = config.get("height_mm", 2100)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide {_mm_to_ft(h)} tall bookshelf and display unit with open shelves and closed cabinets below, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_crockery_unit_prompt(config: dict) -> str:
    w = config.get("width_mm", 1200)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide crockery and bar unit with glass-shuttered display above and closed storage below, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_dressing_table_prompt(config: dict) -> str:
    w = config.get("width_mm", 1050)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide dressing table with large mirror, side drawers, and vanity light strip, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_chest_of_drawers_prompt(config: dict) -> str:
    grade = config.get("material_grade", "standard")
    return f"5-drawer chest of drawers with soft-close slides, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_dining_table_prompt(config: dict) -> str:
    seaters = config.get("seaters", 6)
    material = config.get("material", "solid wood")
    return f"{seaters}-seater dining table with matching chairs, {material}, Indian dining room style"


def build_buffet_sideboard_prompt(config: dict) -> str:
    w = config.get("width_mm", 1500)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(w)} wide buffet sideboard with closed cabinet and open display shelf above, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


def build_pantry_unit_prompt(config: dict) -> str:
    h = config.get("height_mm", 2100)
    grade = config.get("material_grade", "standard")
    return f"{_mm_to_ft(h)} tall full-height pantry/larder unit with pull-out baskets and shelves, {GRADE_STYLE.get(grade, GRADE_STYLE['standard'])}"


_BUILDERS = {
    "wardrobe":               build_wardrobe_prompt,
    "wardrobe_sliding_2door": build_wardrobe_prompt,
    "wardrobe_hinged_3door":  build_wardrobe_prompt,
    "sofa":                   build_sofa_prompt,
    "tv_unit":                build_tv_unit_prompt,
    "tv_unit_floor":          build_tv_unit_prompt,
    "kitchen":                build_kitchen_prompt,
    "kitchen_l_shape":        build_kitchen_prompt,
    "study_table":            build_study_table_prompt,
    "study_table_standard":   build_study_table_prompt,
    "study":                  build_study_table_prompt,
    "bed":                    build_bed_prompt,
    "bed_queen_hydraulic":    build_bed_prompt,
    "storage_bed":            build_bed_prompt,
    # Bathroom
    "vanity_unit":            build_vanity_unit_prompt,
    "mirror_cabinet":         build_mirror_cabinet_prompt,
    "bathroom_linen_tower":   build_bathroom_linen_tower_prompt,
    # Balcony
    "balcony_seating":        build_balcony_seating_prompt,
    "planter_box":            build_planter_box_prompt,
    # Pooja
    "pooja_unit":             build_pooja_unit_prompt,
    "pooja_storage":          build_pooja_storage_prompt,
    # Foyer
    "shoe_cabinet":           build_shoe_cabinet_prompt,
    "console_unit":           build_console_unit_prompt,
    # Living extras
    "bookshelf_unit":         build_bookshelf_unit_prompt,
    "crockery_unit":          build_crockery_unit_prompt,
    # Bedroom extras
    "dressing_table":         build_dressing_table_prompt,
    "chest_of_drawers":       build_chest_of_drawers_prompt,
    # Dining
    "dining_table_set":       build_dining_table_prompt,
    "buffet_sideboard":       build_buffet_sideboard_prompt,
    # Kitchen extras
    "pantry_unit":            build_pantry_unit_prompt,
}

ROOM_CONTEXT = {
    "bedroom":  "Indian bedroom, warm ambient lighting, cream walls, wooden flooring",
    "living":   "Indian living room, natural light from windows, light walls, marble or wooden flooring",
    "kitchen":  "Indian modular kitchen, bright task lighting, tiled splashback, clean lines",
    "dining":   "Indian dining room, warm chandelier light, wooden flooring, elegant walls",
    "study":    "Indian home office / study, warm desk lighting, carpet or wooden floor, minimal walls",
    "bathroom": "Indian bathroom, bright vanity lighting, large-format floor tiles, clean white walls with accent tile",
    "balcony":  "Indian apartment balcony, natural light, terracotta or stone-effect floor tiles, garden greenery",
    "pooja":    "Indian pooja room, warm temple lighting, marble flooring, cream and gold walls, devotional atmosphere",
    "foyer":    "Indian home entrance foyer, natural light from door, light stone or tile flooring, welcoming aesthetic",
    "passage":  "Indian home passage / corridor, recessed ceiling lighting, designer wall paneling, premium flooring, elegant and spacious feel",
}


_GRADE_FINISHES = {
    "budget": (
        "smooth painted walls in warm white or beige, plain ceiling with basic LED panel lights, "
        "good quality vitrified tile flooring in light grey or cream"
    ),
    "standard": (
        "one feature wall with textured wallpaper or wooden veneer panel, false ceiling with "
        "recessed LED spotlights and cove lighting, large-format vitrified marble-finish tile flooring, "
        "warm ambient lighting throughout"
    ),
    "premium": (
        "marble or stone accent wall panel with brushed gold trim and LED backlight, "
        "designer false ceiling with cove lighting, recessed spotlights, and a statement chandelier, "
        "large-format Italian marble or high-gloss tile flooring, architectural accent lighting"
    ),
}

# Room-type-specific finish overrides — these replace _GRADE_FINISHES for special rooms.
_ROOM_FINISHES: dict[str, dict[str, str]] = {
    "bathroom": {
        "budget":   "white subway tile walls, basic vitrified floor tiles, chrome fittings, plain LED mirror light",
        "standard": "large-format wall tiles with contrasting border strip, anti-skid floor tiles, backlit LED mirror, "
                    "rain shower area with glass partition, chrome accessories",
        "premium":  "full-height marble or book-match tile walls, heated floor tiles, designer LED backlit mirror, "
                    "frameless glass shower enclosure, brushed gold fittings, freestanding bathtub niche",
    },
    "balcony": {
        "budget":   "clean painted walls, anti-skid ceramic floor tiles, simple metal railing, basic planter pots",
        "standard": "textured stone-finish wall cladding, outdoor wood-look WPC deck flooring, glass railing, "
                    "string lights or wall lantern, potted plants arranged neatly",
        "premium":  "natural stone accent wall, premium teak or IPE wood decking, frameless glass railing with SS handrail, "
                    "recessed step lighting, lush vertical garden or pergola",
    },
    "pooja": {
        "budget":   "cream painted walls, simple vitrified tile flooring, basic wooden mandir shelf with LED strip",
        "standard": "one white marble or stone accent wall behind the mandir, marble tile flooring, "
                    "warm recessed spotlights and LED backlight behind the unit, fresh flowers and brass diyas",
        "premium":  "full Italian marble wall panel with gold inlay trim, white marble flooring with brass border inlay, "
                    "cove lighting in warm amber, statement brass hanging lamp, hand-carved wooden arch detailing",
    },
    "foyer": {
        "budget":   "painted walls, vitrified tile flooring, simple wall mirror and coat hooks",
        "standard": "one textured or wooden panel feature wall, large-format tile flooring, recessed ceiling spotlights, "
                    "statement wall mirror with gold frame, console table",
        "premium":  "marble or fluted wood accent wall panel, large Italian marble tile flooring, "
                    "architectural cove lighting, full-height designer mirror, statement pendant light",
    },
    "passage": {
        "budget":   "clean painted walls, vitrified tile flooring, recessed LED ceiling lights along the corridor length",
        "standard": "fluted wood or textured panel wainscoting on both walls, large-format marble-look tile flooring, "
                    "recessed spotlights with continuous LED cove strip along the ceiling, wall sconces at intervals",
        "premium":  "full-height book-matched marble or fluted walnut paneling on both walls, polished marble tile flooring with border inlay, "
                    "dramatic cove lighting running the full corridor length, decorative wall niches with LED backlight and artwork",
    },
}


_KONTEXT_FINISHES = {
    "budget": [
        "clean white painted walls, cream vitrified tile floors, recessed LED panel ceiling lights",
        "light grey painted walls, polished beige tile floors, warm white LED lighting",
        "off-white walls with subtle texture, large-format stone-effect floor tiles, simple false ceiling with downlights",
    ],
    "standard": [
        "warm oak wood panel feature wall, large-format Calacatta marble-look floor tiles, LED cove ceiling lighting with warm glow",
        "textured plaster walls in warm ivory, herringbone pattern wooden floor, recessed spotlights with cove accent lighting",
        "fluted wood paneling on feature wall, polished light grey marble floors, elegant false ceiling with perimeter cove LED",
        "stone-effect textured wall panel, premium vitrified tile floors in cream and gold, designer false ceiling with recessed lights",
    ],
    "premium": [
        "book-matched Calacatta marble walls with gold veining, matching polished marble floors, designer false ceiling with cove and crystal chandelier",
        "warm walnut fluted wall panels with brass inlay trim, honed travertine floors, architectural cove ceiling with warm amber lighting",
        "Statuario white marble feature wall, herringbone white marble floors, layered false ceiling with perimeter cove and statement pendant",
        "dark charcoal fluted panels with brushed gold trim, Emperador dark marble floors, dramatic cove ceiling with accent spotlights",
        "limewash plaster walls in warm ivory, large-format travertine floors, arched niches with amber backlight and cove LED ceiling",
    ],
}


def build_kontext_edit_prompt(
    room_type: str,
    furniture_items: list[dict],
    material_grade: str = "standard",
    notes: str = "",
    mood_description: str = "",
    selected_style: str | None = None,
    has_furniture_reference: bool = False,
) -> str:
    """Full interior transformation prompt for FLUX Kontext Pro.

    Describes the COMPLETE desired room — walls, ceiling, flooring, and furniture
    all redesigned. Only the structural geometry is preserved: room footprint,
    window openings, door openings, and camera angle.
    Pair with guidance_scale=6.5 so Kontext actually overrides all surfaces.
    """
    room_labels = {
        "bedroom": "Indian bedroom",
        "living":  "Indian living room",
        "kitchen": "Indian modular kitchen",
        "dining":  "Indian dining room",
        "study":   "Indian home study",
        "bathroom":"Indian bathroom",
        "balcony": "Indian apartment balcony",
        "pooja":   "Indian pooja room",
        "foyer":   "Indian home entrance foyer",
        "passage": "Indian home passage / corridor",
    }
    room_label = room_labels.get(room_type or "living", f"Indian {room_type} room")

    if has_furniture_reference:
        # Reference placement mode — the user provided a specific furniture image.
        # Rule: constraints first, transformation last. The model reads left-to-right;
        # if transformation intent leads, it redesigns everything and ignores preservations.

        # Resolve the specific piece name from furniture_items so the prompt is concrete.
        _type_labels = {
            "bed": "bed", "storage_bed": "bed",
            "wardrobe": "wardrobe",
            "sofa": "sofa",
            "tv_unit": "TV unit",
            "kitchen": "kitchen",
            "dining_table_set": "dining table",
            "study": "study table", "study_table": "study table",
            "dressing_table": "dressing table",
            "chest_of_drawers": "chest of drawers",
            "bookshelf_unit": "bookshelf unit",
            "crockery_unit": "crockery unit",
            "shoe_cabinet": "shoe cabinet",
            "console_unit": "console table",
            "pooja_unit": "pooja unit",
            "vanity_unit": "vanity unit",
        }
        piece_name = "furniture piece"
        if furniture_items:
            piece_name = _type_labels.get(furniture_items[0].get("item_type", ""), "furniture piece")

        known_piece = piece_name != "furniture piece"

        parts = [f"Targeted edit of an existing {room_label} photo"]

        if known_piece:
            # Specific piece selected — surgical swap, everything else pixel-accurate.
            parts += [
                "DO NOT CHANGE: ceiling structure, ceiling height, wall colour, wall finish, "
                "window positions, door positions, floor material, room proportions, or any existing furniture "
                "that is not being replaced — keep them pixel-accurate to Image 1",
                f"ONLY CHANGE: replace the {piece_name} with the exact {piece_name} shown in Image 2 — "
                "match its colour, material, wood finish, and design precisely. "
                "Do not substitute with a modern or different style",
            ]
        else:
            # No specific piece selected — reference image sets the style direction.
            # Still redesign the furniture and surfaces, just keep room structure intact.
            parts += [
                "DO NOT CHANGE: ceiling structure, ceiling height, window positions, door positions, "
                "room proportions — keep them pixel-accurate to Image 1",
                "Use Image 2 as the design direction: redesign the furniture and interior surfaces "
                "(walls, flooring) to match its style, colour palette, and material aesthetic. "
                "Generate unique premium furniture — not generic standard designs",
            ]

        if notes:
            parts.append(
                f"Client context (apply only to the visible room space — "
                f"do not render anything beyond doorways based on these notes): {notes}"
            )
        parts.append("Photorealistic result, no people")
        return ". ".join(parts)

    # Full transformation mode — no reference image, free to redesign everything.
    finish_options = _KONTEXT_FINISHES.get(material_grade, _KONTEXT_FINISHES["standard"])
    finishes = random.choice(finish_options)

    furniture_prompts, style = build_furniture_prompts(furniture_items, material_grade, selected_style=selected_style)
    preserve = _preserve_furniture(notes)

    if not preserve:
        if furniture_prompts:
            furniture_desc = "; ".join(furniture_prompts)
        else:
            room_keys = _ROOM_STYLE_KEYS.get(room_type or "living", [])
            default_pieces = [style[k] for k in room_keys if k in style]
            furniture_desc = "; ".join(default_pieces) if default_pieces else f"premium designer {room_label} furniture"
    else:
        furniture_desc = None

    style_clause = mood_description[:150] if mood_description else style["vision"]

    # Constraints FIRST — the model reads left-to-right; leading with structure preservation
    # prevents it from inventing new doors/windows or shifting the camera before it sees the
    # transformation instructions.
    parts = [
        "CRITICAL — preserve exactly: camera angle, viewpoint, room proportions, "
        "and the exact position and size of every existing window, door, archway, and passage. "
        "Do NOT add, move, or remove any architectural openings. "
        "Doorways and openings connect to other rooms that are OFF-CAMERA — treat them as dark "
        "voids or shadowed openings; do NOT render, imply, or show any furniture or room interior beyond them",
        f"Complete luxury interior redesign of this {room_label}",
    ]

    if notes:
        parts.append(
            f"Client context about this space (use only to understand the room — "
            f"redesign only what is physically visible in this photo, not spaces mentioned beyond doorways): {notes}"
        )

    parts += [
        f"Design style: {style_clause}",
        f"Surfaces: {finishes}",
        "False ceiling with cove LED lighting and recessed spotlights",
    ]

    if furniture_desc is not None:
        parts.append(f"Furniture: {furniture_desc}")
        parts.append(
            "Every furniture piece must have a distinctive, custom-designed silhouette — "
            "unique proportions, unusual material combinations, bespoke detailing. "
            "Avoid generic catalogue furniture; make it look one-of-a-kind and architect-specified"
        )

    parts += [
        "Redesign all interior surfaces: wall treatment, flooring, ceiling design, and all furniture",
        "Photorealistic interior photography, high quality, no people",
    ]

    return ". ".join(parts)


def build_edit_image_prompt(
    room_type: str,
    furniture_items: list[dict],
    material_grade: str = "standard",
    notes: str = "",
    reference_descriptions: dict[int, str] | None = None,
    mood_description: str = "",
    has_visual_references: bool = False,
    selected_style: str | None = None,
) -> str:
    """Build a gpt-image-1 prompt for complete interior transformation visualization.

    The carpenter uploads a room photo and wants to show the client a dramatic,
    magazine-worthy redesign — walls, flooring, ceiling, lighting, and furniture
    all completely transformed. This is the core value proposition.

    has_visual_references: when True, the additional reference images are passed
    directly to gpt-image-1, so the prompt instructs it to use those exact pieces.
    """
    furniture_prompts, style = build_furniture_prompts(furniture_items, material_grade, reference_descriptions, selected_style)
    # Resolve furniture description — always replace unless notes say otherwise.
    preserve = _preserve_furniture(notes)
    if not preserve:
        if furniture_prompts:
            furniture_desc = "; ".join(furniture_prompts)
        else:
            room_keys = _ROOM_STYLE_KEYS.get(room_type or "living", [])
            default_pieces = [style[k] for k in room_keys if k in style]
            furniture_desc = "; ".join(default_pieces) if default_pieces else ""
    else:
        furniture_desc = None  # explicit signal to skip furniture instructions

    # Only furniture changes — all surfaces and structure stay exactly as-is
    parts = []

    if furniture_desc is not None:
        parts.append("Remove all existing furniture, ceiling fans, and loose decor items")
        if furniture_desc:
            parts.append(
                f"Place these furniture pieces naturally in the cleared space: {furniture_desc}"
            )
        else:
            parts.append(
                f"Place appropriate premium furniture for a {room_type or 'living'} room "
                "naturally in the cleared space"
            )

    if has_visual_references:
        parts.append(
            "The reference images show the exact furniture style to use — "
            "match that aesthetic for the new pieces"
        )
    elif mood_description:
        parts.append(f"Furniture style reference: {mood_description}")

    if notes:
        parts.append(
            f"Client context (redesign only what is visible in this photo — "
            f"do not render spaces or rooms mentioned as being beyond doorways): {notes}"
        )

    parts += [
        "Keep all existing walls, ceiling, floor, doors, windows, passages, and archways "
        "exactly as they appear in the original photo — do not change any surfaces or structure. "
        "Doorways are architectural openings only — do NOT render what lies beyond them",
        "Photorealistic result, same lighting and camera angle as the original, no people",
    ]

    return ". ".join(parts)


def build_furniture_prompts(
    furniture_items: list[dict],
    material_grade: str = "standard",
    reference_descriptions: dict[int, str] | None = None,
    selected_style: str | None = None,
) -> list[str]:
    """Build per-item furniture prompts.

    When reference_descriptions[i] is set (from Claude vision of a reference photo
    the user uploaded for that item), use that exact description instead of the
    generic spec. Otherwise, apply a designer style (forced by selected_style or
    randomly picked) so each generation looks distinct.
    """
    ref = reference_descriptions or {}
    style = _pick_style(material_grade, forced_name=selected_style)
    prompts = []

    for i, item in enumerate(furniture_items):
        if i in ref:
            label = item.get("item_type", "furniture").replace("_", " ")
            prompts.append(f"{label} matching the reference photo: {ref[i]}")
        else:
            item_type = item.get("item_type", "")
            # Use style-specific furniture description if available, else fall back to builder
            style_desc = style.get(item_type) or style.get(item_type.split("_")[0])
            if style_desc:
                prompts.append(style_desc)
            else:
                config = {**item.get("config", {}), "material_grade": material_grade}
                builder = _BUILDERS.get(item_type)
                base = builder(config) if builder else f"{item_type.replace('_', ' ')}"
                prompts.append(f"{base} in {style['default']} finish")

    return prompts, style


def build_complete_image_prompt(
    room_type: str,
    dims: dict | None,
    furniture_items: list[dict],
    material_grade: str = "standard",
    notes: str = "",
    mood_hint: str = "",
    room_description: str = "",
    reference_descriptions: dict[int, str] | None = None,
    mood_description: str = "",
    selected_style: str | None = None,
) -> str:
    """Build a DALL-E 3 prompt for a COMPLETE ROOM TRANSFORMATION — not isolated furniture.

    The prompt describes every element of the room together: furniture, walls,
    flooring, lighting, decor, and ambience — all visually coordinated.

    When room_description is provided (from Claude Haiku vision of an uploaded photo),
    the prompt is anchored to the real room's permanent features so DALL-E 3 generates
    a design that matches the actual walls, flooring, and light of that space.
    """
    room_ctx = ROOM_CONTEXT.get(room_type or "", ROOM_CONTEXT["living"])

    dim_str = ""
    if dims:
        w = dims.get("width_mm") or dims.get("room_width_mm")
        length = dims.get("length_mm") or dims.get("room_length_mm")
        if w and length:
            dim_str = f"{_mm_to_ft(w)} × {_mm_to_ft(length)}, "

    furniture_prompts, style = build_furniture_prompts(furniture_items, material_grade, reference_descriptions, selected_style)
    furniture_desc = "; ".join(furniture_prompts) if furniture_prompts else "beautifully designed furniture"
    style_vision = style["vision"]

    if room_description:
        prompt_parts = [
            f"Complete luxury redesign of a real {room_type or 'living'} room — dramatic magazine-worthy transformation",
            f"Room geometry to keep: {room_description} — preserve only the floor plan shape, window openings, door openings, and camera angle",
            "COMPLETELY REPLACE: all wall surfaces with rich new treatment, ceiling with false ceiling and cove LED lighting, flooring with premium new material, and remove all existing furniture and fans",
            f"Design vision: {style_vision}",
            f"New furniture: {furniture_desc}",
            "Coordinated decor: statement area rug, layered cushions, designer curtains, indoor plants, wall art",
            "professional interior photography, wide-angle shot, 4K, photorealistic, Indian home",
        ]
    else:
        prompt_parts = [
            f"Stunning luxury interior design photograph — {dim_str}{room_ctx}",
            f"Design vision: {style_vision}",
            f"Furniture: {furniture_desc}",
            "Rich wall treatment: wood panelling or marble accent wall, designer false ceiling with cove LED lighting and recessed spotlights, premium large-format tile or wood flooring",
            "Coordinated decor: statement area rug, layered cushions, curtains or blinds, indoor plants, wall art",
            "professional interior photography, wide-angle shot showing full room, 4K, photorealistic",
            "no people, warm professional lighting, dramatic and complete transformation, Indian home interior style",
        ]

    if mood_description:
        prompt_parts.insert(1, f"Style reference from uploaded image: {mood_description}. Match this aesthetic throughout")
    elif mood_hint:
        prompt_parts.insert(1, f"Mood: {mood_hint}")
    if notes:
        prompt_parts.insert(-4, f"Special requirements: {notes}")

    return ". ".join(prompt_parts)


def build_ideogram_prompt(
    room_type: str,
    furniture_items: list[dict],
    material_grade: str = "standard",
    notes: str = "",
    reference_descriptions: dict[int, str] | None = None,
    mood_description: str = "",
    selected_style: str | None = None,
) -> str:
    """Prompt optimised specifically for Ideogram v3.

    Ideogram drifts on long prompts. Keep it under ~120 words, lead with the
    scene, then the style, then the key furniture — that order makes it anchor
    to the right room before applying the style.
    """
    room_labels = {
        "bedroom": "Indian bedroom",
        "living":  "Indian living room",
        "kitchen": "Indian modular kitchen",
        "dining":  "Indian dining room",
        "study":   "Indian home study",
        "bathroom":"Indian bathroom",
        "balcony": "Indian apartment balcony",
        "pooja":   "Indian pooja room",
        "foyer":   "Indian home entrance foyer",
        "passage": "Indian home passage / corridor",
    }
    scene = room_labels.get(room_type or "living", f"Indian {room_type} room")

    furniture_prompts, style = build_furniture_prompts(furniture_items, material_grade, reference_descriptions, selected_style)
    style_name = style["name"]

    # Keep 2 descriptive clauses per item — rich enough to show craftsmanship, short enough not to drift
    def _clip(p: str) -> str:
        clauses = [c.strip() for c in p.split(",")]
        return ", ".join(clauses[:2])

    if furniture_prompts:
        furniture_list = " | ".join(_clip(p) for p in furniture_prompts)
    else:
        furniture_list = "premium designer furniture"

    # Short style essence — anchor clause only
    style_short = style["vision"].split(",")[0].strip()

    # Grade-aware quality label drives Ideogram's realism level
    grade_label = "ultra-luxury" if material_grade == "premium" else "premium modern"

    parts = [
        f"Dramatic {grade_label} interior design transformation photograph of a {scene}",
        f"Style: {style_name} — {style_short}",
        "Rich wall treatment: marble or wood feature wall panel with gold trim accents",
        "Designer false ceiling with cove LED lighting and recessed spotlights",
        "Premium large-format marble or wood flooring",
        f"Furniture: {furniture_list}",
        "each piece beautifully crafted and clearly visible, designer showroom quality",
    ]
    if mood_description:
        parts.append(f"Match this style: {mood_description[:80]}")
    if notes:
        parts.append(f"Notes: {notes[:50]}")
    parts += [
        "wide-angle room shot, Architectural Digest photography quality",
        "warm dramatic lighting, complete transformation, no people, 4K ultra-sharp photorealistic",
    ]

    return ". ".join(parts)


def build_interior_design_prompt(
    room_type: str,
    furniture_items: list[dict],
    material_grade: str = "standard",
    selected_style: str | None = None,
    mood_description: str = "",
) -> str:
    """Prompt for adirik/interior-design (ControlNet-based model).

    This model expects a short, descriptive scene prompt — NOT instruction-based
    language like "replace X with Y". It reads the prompt as a target scene
    description and uses ControlNet depth to preserve room geometry automatically.
    """
    furniture_prompts, style = build_furniture_prompts(furniture_items, material_grade, selected_style=selected_style)

    room_labels = {
        "bedroom":  "bedroom",
        "living":   "living room",
        "kitchen":  "kitchen",
        "dining":   "dining room",
        "study":    "home office",
        "bathroom": "bathroom",
        "balcony":  "balcony",
        "pooja":    "pooja room",
        "foyer":    "entrance foyer",
        "passage":  "passage / corridor",
    }
    room_label = room_labels.get(room_type or "living", f"{room_type} room")

    # For this model: lead with grade adjective + room + style + furniture
    grade_adj = {"budget": "clean modern", "standard": "premium", "premium": "luxury"}.get(material_grade, "premium")

    if mood_description:
        style_clause = mood_description[:100]
    else:
        style_clause = style["name"] + " style, " + style["vision"].split(",")[0].strip()

    # Furniture — short descriptive clauses, pipe-separated
    if furniture_prompts:
        def _clip2(p: str) -> str:
            clauses = [c.strip() for c in p.split(",")]
            return ", ".join(clauses[:3])
        furniture_clause = ", ".join(_clip2(p) for p in furniture_prompts)
    else:
        room_keys = _ROOM_STYLE_KEYS.get(room_type or "living", [])
        default_pieces = [style[k] for k in room_keys if k in style]
        furniture_clause = ", ".join(p.split(",")[0] for p in default_pieces) if default_pieces else "premium designer furniture"

    prompt = (
        f"{grade_adj} Indian {room_label}, {style_clause}, "
        f"{furniture_clause}, "
        "photorealistic interior design photography, professional lighting, no people"
    )
    return prompt
