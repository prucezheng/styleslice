#!/usr/bin/env python3
"""Deterministically extract a palette and render a StyleSlice design-token board."""

from __future__ import annotations

import argparse
import colorsys
import datetime as dt
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

import numpy as np
from PIL import Image, ImageOps


WIDTH, HEIGHT = 1680, 945
ROLE_ORDER = ("primary", "secondary", "neutral", "accent")
ROLE_LABEL = {
    "primary": "Primary",
    "secondary": "Secondary",
    "neutral": "Neutral",
    "accent": "Accent",
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def rgb_to_hex(rgb: np.ndarray | tuple[int, int, int]) -> str:
    values = [int(round(clamp(float(v) / 255.0) * 255)) for v in rgb]
    return "#" + "".join(f"{v:02X}" for v in values)


def hex_to_rgb(value: str) -> np.ndarray:
    value = value.lstrip("#")
    return np.array([int(value[i : i + 2], 16) for i in (0, 2, 4)], dtype=float)


def relative_luminance(rgb: np.ndarray) -> float:
    values = rgb / 255.0
    values = np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)
    return float(values @ np.array([0.2126, 0.7152, 0.0722]))


def contrast_text(hex_value: str) -> str:
    return "#111111" if relative_luminance(hex_to_rgb(hex_value)) > 0.43 else "#FFFFFF"


def mix(hex_a: str, hex_b: str, amount_b: float) -> str:
    rgb = hex_to_rgb(hex_a) * (1 - amount_b) + hex_to_rgb(hex_b) * amount_b
    return rgb_to_hex(rgb)


def saturation(rgb: np.ndarray) -> float:
    _, s, _ = colorsys.rgb_to_hsv(*(rgb / 255.0))
    return float(s)


def hsv(rgb: np.ndarray) -> tuple[float, float, float]:
    return colorsys.rgb_to_hsv(*(rgb / 255.0))


def color_distance(a: np.ndarray, b: np.ndarray) -> float:
    # Weighted RGB distance; deterministic and sufficient after coarse image quantization.
    mean_r = (a[0] + b[0]) / 2.0
    dr, dg, db = a - b
    return math.sqrt((2 + mean_r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean_r) / 256) * db * db)


def normalize_image(path: Path) -> np.ndarray:
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGBA")
        background = Image.new("RGBA", image.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, image).convert("RGB")
        image.thumbnail((240, 240), Image.Resampling.LANCZOS)
        pixels = np.asarray(image, dtype=np.uint8).reshape(-1, 3)
    if len(pixels) < 4:
        raise ValueError("Image contains too few pixels")
    return pixels


def weighted_quantize(pixels: np.ndarray, bins: int = 16, clusters: int = 10) -> list[dict]:
    # Collapse nearby pixels first, then run fixed-seed weighted k-means.
    quantized = (pixels // bins).astype(np.int16)
    keys, counts = np.unique(quantized, axis=0, return_counts=True)
    points = keys.astype(float) * bins + (bins - 1) / 2
    weights = counts.astype(float)
    first = int(np.argmax(weights))
    centers = [points[first]]
    while len(centers) < min(clusters, len(points)):
        distances = np.min(
            np.stack([np.sum((points - c) ** 2, axis=1) for c in centers], axis=1), axis=1
        )
        score = distances * np.sqrt(weights)
        centers.append(points[int(np.argmax(score))])
    centers_arr = np.array(centers, dtype=float)
    assignments = np.zeros(len(points), dtype=int)
    for _ in range(18):
        distances = np.sum((points[:, None, :] - centers_arr[None, :, :]) ** 2, axis=2)
        next_assignments = np.argmin(distances, axis=1)
        if np.array_equal(assignments, next_assignments) and _ > 0:
            break
        assignments = next_assignments
        for idx in range(len(centers_arr)):
            mask = assignments == idx
            if mask.any():
                centers_arr[idx] = np.average(points[mask], axis=0, weights=weights[mask])
    result = []
    total = float(weights.sum())
    for idx, center in enumerate(centers_arr):
        weight = float(weights[assignments == idx].sum())
        if weight > 0:
            result.append({"rgb": np.clip(center, 0, 255), "weight": weight / total})
    return sorted(result, key=lambda item: item["weight"], reverse=True)


def ensure_distinct(candidates: list[dict], minimum: float = 42) -> list[dict]:
    chosen: list[dict] = []
    for candidate in candidates:
        if not chosen or all(color_distance(candidate["rgb"], item["rgb"]) >= minimum for item in chosen):
            chosen.append(candidate)
    return chosen or candidates[:1]


def pick_palette(candidates: list[dict]) -> dict[str, dict]:
    pool = ensure_distinct(candidates)
    if len(pool) < 4:
        pool = candidates

    def neutral_score(item: dict) -> float:
        _, sat, value = hsv(item["rgb"])
        # Background neutrals are usually common and relatively low-chroma.
        return item["weight"] * 3.0 + (1 - sat) * 0.8 + (0.3 if value > 0.72 else 0)

    neutral = max(pool, key=neutral_score)
    remaining = [item for item in pool if item is not neutral]
    if not remaining:
        remaining = pool

    def primary_score(item: dict) -> float:
        _, sat, value = hsv(item["rgb"])
        usable = 1.0 if 0.14 < value < 0.94 else 0.45
        return (item["weight"] * 2.2 + sat * 0.85) * usable

    primary = max(remaining, key=primary_score)
    remaining = [item for item in remaining if item is not primary]
    if not remaining:
        remaining = pool

    def accent_score(item: dict) -> float:
        _, sat, value = hsv(item["rgb"])
        rarity = 1 - min(1, item["weight"] * 3)
        separation = color_distance(item["rgb"], primary["rgb"]) / 765
        return sat * 1.25 + rarity * 0.35 + separation * 0.45 + (0.15 if value > 0.45 else 0)

    accent = max(remaining, key=accent_score)
    remaining = [item for item in remaining if item is not accent]
    if not remaining:
        remaining = pool

    def secondary_score(item: dict) -> float:
        separation = min(
            color_distance(item["rgb"], primary["rgb"]),
            color_distance(item["rgb"], accent["rgb"]),
        )
        return item["weight"] * 1.5 + separation / 320 + saturation(item["rgb"]) * 0.35

    secondary = max(remaining, key=secondary_score)
    selected = {"primary": primary, "secondary": secondary, "neutral": neutral, "accent": accent}

    # A nearly monochrome image may collapse roles; derive stable tonal alternatives.
    used: list[np.ndarray] = []
    for index, role in enumerate(ROLE_ORDER):
        rgb = selected[role]["rgb"].copy()
        if any(color_distance(rgb, previous) < 24 for previous in used):
            base = primary["rgb"] if role != "neutral" else neutral["rgb"]
            target = np.array([255, 255, 255]) if index % 2 else np.array([17, 17, 17])
            rgb = base * 0.66 + target * 0.34
            selected[role] = {**selected[role], "rgb": rgb, "derived": True}
        used.append(rgb)
    return selected


def color_name(rgb: np.ndarray, role: str) -> str:
    h, s, v = hsv(rgb)
    if s < 0.11:
        family = "White" if v > 0.9 else "Gray" if v > 0.28 else "Black"
    else:
        degree = h * 360
        families = [
            (15, "Red"), (42, "Orange"), (70, "Yellow"), (155, "Green"),
            (190, "Teal"), (250, "Blue"), (285, "Violet"), (330, "Magenta"), (360, "Red"),
        ]
        family = next(name for boundary, name in families if degree < boundary)
    modifier = "Soft" if s < 0.35 else "Vivid" if s > 0.72 else "Clear"
    if v < 0.3:
        modifier = "Deep"
    elif v > 0.9 and s < 0.35:
        modifier = "Pale"
    return f"{modifier} {family}" if role != "neutral" or family not in ("Gray", "White", "Black") else f"Warm {family}"


def parse_percent(value: object) -> float | None:
    if not isinstance(value, str):
        return None
    digits = "".join(ch for ch in value if ch.isdigit() or ch == ".")
    try:
        return float(digits)
    except ValueError:
        return None


def load_analysis(path: Path | None) -> dict:
    if not path:
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def infer_keywords(pixels: np.ndarray, palette: dict[str, dict]) -> list[str]:
    arr = pixels.astype(float) / 255.0
    spread = float(np.std(arr))
    sats = np.array([colorsys.rgb_to_hsv(*pixel)[1] for pixel in arr[:: max(1, len(arr) // 4000)]])
    mean_sat = float(np.mean(sats))
    mean_light = float(np.mean(arr))
    primary_hue = hsv(palette["primary"]["rgb"])[0]
    temperature = "Warm" if primary_hue < 0.18 or primary_hue > 0.88 else "Cool"
    return [
        temperature,
        "Vivid" if mean_sat > 0.48 else "Muted",
        "High Contrast" if spread > 0.29 else "Soft Contrast",
        "Bright" if mean_light > 0.62 else "Deep",
        "Everyday",
    ]


def build_tokens(image_path: Path, analysis_path: Path | None, name: str | None, source: str | None) -> dict:
    pixels = normalize_image(image_path)
    palette = pick_palette(weighted_quantize(pixels))
    analysis = load_analysis(analysis_path)
    analysis_colors = analysis.get("colors", []) if isinstance(analysis.get("colors"), list) else []
    analysis_by_role = {}
    for item in analysis_colors:
        if isinstance(item, dict) and item.get("role") in ("primary", "secondary", "background", "accent"):
            analysis_by_role["neutral" if item["role"] == "background" else item["role"]] = item

    raw_weights = np.array([max(0.01, palette[role]["weight"]) for role in ROLE_ORDER], dtype=float)
    raw_weights = raw_weights / raw_weights.sum() * 100
    rounded = np.floor(raw_weights).astype(int)
    rounded[np.argmax(raw_weights - rounded)] += 100 - int(rounded.sum())
    colors = []
    for index, role in enumerate(ROLE_ORDER):
        rgb = palette[role]["rgb"]
        supporting = analysis_by_role.get(role, {})
        supporting_hex = supporting.get("hex") if isinstance(supporting, dict) else None
        # Semantic names are accepted only when the analysis color actually matches
        # the deterministic sample. This prevents stale or unrelated JSON from
        # silently mislabeling a swatch.
        semantic_match = False
        if isinstance(supporting_hex, str) and len(supporting_hex) == 7:
            try:
                semantic_match = color_distance(rgb, hex_to_rgb(supporting_hex)) < 58
            except ValueError:
                semantic_match = False
        colors.append(
            {
                "role": role,
                "label": ROLE_LABEL[role],
                "name": str(supporting.get("name") if semantic_match and supporting.get("name") else color_name(rgb, role)),
                "hex": rgb_to_hex(rgb),
                "proportion": int(rounded[index]),
                "derived": bool(palette[role].get("derived", False)),
            }
        )

    keywords = []
    for item in analysis.get("keywords", []):
        if isinstance(item, dict) and item.get("word"):
            keywords.append(str(item["word"]))
        elif isinstance(item, str):
            keywords.append(item)
    if not keywords:
        keywords = infer_keywords(pixels, palette)
    keywords = (keywords + ["Clear", "Balanced", "Reusable", "Everyday", "Coherent"])[:5]

    return {
        "schemaVersion": "1.0",
        "name": name or str(analysis.get("name") or image_path.stem),
        "summary": str(analysis.get("summary") or "Deterministic visual tokens extracted from the source image."),
        "source": source or image_path.name,
        # Use source metadata instead of wall-clock time so repeated runs on the
        # same file remain byte-identical across days.
        "createdAt": dt.datetime.fromtimestamp(image_path.stat().st_mtime).date().isoformat(),
        "version": "v1.0",
        "colors": colors,
        "keywords": keywords,
        "layout": {"spacing": [8, 16, 24, 32], "radius": [4, 8, 12, 16], "border": [1, 2, 3, 4]},
        "constraints": {
            "canvas": [WIDTH, HEIGHT],
            "template": "styleslice-ui-board-v1",
            "typographySpecimens": False,
            "coreColorCount": 4,
        },
    }


def svg_text(x: float, y: float, text: object, size: int = 14, weight: int = 500, anchor: str = "start", fill: str = "#111111") -> str:
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{fill}">{escape(str(text))}</text>'


def rect(x: float, y: float, w: float, h: float, fill: str = "#FFFFFF", stroke: str = "none", sw: float = 1, radius: float = 10, extra: str = "") -> str:
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'


def line(x1: float, y1: float, x2: float, y2: float, stroke: str = "#111111", sw: float = 2, dash: str = "") -> str:
    dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"{dash_attr}/>'


def circle(cx: float, cy: float, radius: float, fill: str = "none", stroke: str = "#111111", sw: float = 2) -> str:
    return f'<circle cx="{cx}" cy="{cy}" r="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def panel(x: int, y: int, w: int, h: int, title: str) -> list[str]:
    return [rect(x, y, w, h, "#FFFFFF", "#E7E9EC", 1, 14), svg_text(x + 22, y + 38, title, 17, 650)]


def tonal_ramp(base: str) -> list[str]:
    return [
        mix(base, "#FFFFFF", 0.86), mix(base, "#FFFFFF", 0.72), mix(base, "#FFFFFF", 0.56),
        mix(base, "#FFFFFF", 0.38), mix(base, "#FFFFFF", 0.20), base,
        mix(base, "#111111", 0.16), mix(base, "#111111", 0.32),
    ]


def icon_house(x: int, y: int, color: str = "#111111") -> str:
    return f'<path d="M{x-12} {y} L{x} {y-10} L{x+12} {y} V{y+13} H{x+4} V{y+4} H{x-4} V{y+13} H{x-12} Z" fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round"/>'


def icon_check(x: int, y: int, color: str = "#111111") -> str:
    return circle(x, y, 13, "none", color, 2) + f'<path d="M{x-6} {y} l4 5 9 -10" fill="none" stroke="{color}" stroke-width="2" stroke-linecap="round"/>'


def icon_user(x: int, y: int, color: str = "#111111") -> str:
    return circle(x, y - 7, 7, "none", color, 2) + f'<path d="M{x-13} {y+14} q1 -13 13 -13 q12 0 13 13" fill="none" stroke="{color}" stroke-width="2"/>'


def icon_gear(x: int, y: int, color: str = "#111111") -> str:
    return circle(x, y, 13, "none", color, 2) + circle(x, y, 4, "none", color, 2) + line(x, y - 18, x, y - 13, color, 2) + line(x, y + 13, x, y + 18, color, 2) + line(x - 18, y, x - 13, y, color, 2) + line(x + 13, y, x + 18, y, color, 2)


def render_svg(tokens: dict) -> str:
    colors = {item["role"]: item for item in tokens["colors"]}
    primary = colors["primary"]["hex"]
    secondary = colors["secondary"]["hex"]
    neutral = colors["neutral"]["hex"]
    accent = colors["accent"]["hex"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
        '<style>text{font-family:"Inter","PingFang SC","Noto Sans CJK SC",Arial,sans-serif}</style>',
        rect(0, 0, WIDTH, HEIGHT, "#F3F4F5", radius=0),
    ]

    # Left token column.
    x, card_w, card_h, gap = 24, 416, 204, 10
    for index, role in enumerate(ROLE_ORDER):
        y = 22 + index * (card_h + gap)
        item = colors[role]
        parts += [rect(x, y, card_w, card_h, "#FFFFFF", "#E7E9EC", 1, 14)]
        parts += [circle(x + 20, y + 25, 8, item["hex"], item["hex"], 1)]
        parts += [svg_text(x + 41, y + 31, f'{item["label"]} — {item["name"]}', 16, 650)]
        parts += [svg_text(x + card_w - 18, y + 31, item["hex"], 16, 550, "end")]
        parts += [rect(x + 16, y + 52, card_w - 32, 80, item["hex"], radius=5)]
        ramps = tonal_ramp(item["hex"])
        swatch_gap, swatch_w = 8, (card_w - 32 - 7 * 8) / 8
        for ramp_index, shade in enumerate(ramps):
            sx = x + 16 + ramp_index * (swatch_w + swatch_gap)
            parts += [rect(sx, y + 139, swatch_w, 30, shade, radius=0)]
            parts += [svg_text(sx + swatch_w / 2, y + 190, (ramp_index + 1) * 100, 11, 500, "middle")]

    # Top row.
    parts += panel(464, 22, 394, 386, "Color Usage")
    usage_y = 104
    for index, role in enumerate(ROLE_ORDER):
        item = colors[role]
        y = usage_y + index * 62
        parts += [svg_text(486, y + 19, f'{item["proportion"]}%', 14, 600)]
        parts += [rect(528, y, 194, 28, "#F6F3EC", "#D7DADF", 1, 5)]
        fill_width = max(12, 194 * item["proportion"] / 100)
        parts += [rect(528, y, fill_width, 28, item["hex"], radius=5)]
        parts += [circle(754, y + 14, 7, item["hex"], item["hex"], 1)]
        parts += [svg_text(771, y + 19, item["label"], 13, 500)]

    parts += panel(872, 22, 416, 386, "Button States")
    state_rows = [("Primary", primary), ("Secondary", secondary), ("Inverted", "#111111"), ("Outlined", "transparent"), ("Disabled", "#E7E8EA")]
    for row_index, (label, color) in enumerate(state_rows):
        y = 84 + row_index * 63
        parts += [svg_text(894, y + 25, label, 13, 550)]
        for col_index, state in enumerate(("Default", "Hover", "Pressed")):
            sx = 996 + col_index * 93
            if label == "Outlined":
                fill, stroke, sw = "#FFFFFF", primary, 1.5
            elif label == "Disabled":
                fill, stroke, sw = color, "#DEE0E3", 1
            else:
                fill = color if col_index == 0 else mix(color, "#FFFFFF" if col_index == 1 else "#111111", 0.12)
                stroke, sw = "none", 0
            parts += [rect(sx, y, 76, 27, fill, stroke, sw, 5)]
            parts += [svg_text(sx + 38, y + 46, state, 10, 450, "middle")]

    parts += panel(1302, 22, 354, 386, "Input Field")
    for idx, label in enumerate(("Default", "Focus")):
        y = 120 + idx * 128
        parts += [svg_text(1330, y - 18, label, 13, 550)]
        parts += [rect(1330, y, 282, 48, "#FFFFFF", primary if label == "Focus" else "#AEB2B8", 2 if label == "Focus" else 1, 6)]
        parts += [circle(1351, y + 22, 8, "none", "#111111", 1.5), line(1357, y + 28, 1364, y + 35, "#111111", 1.5)]

    # Middle row.
    parts += panel(464, 420, 296, 236, "Navigation")
    nav_xs = [505, 572, 639, 706]
    nav_labels = ["Home", "Tasks", "People", "Settings"]
    nav_icons = [icon_house, icon_check, icon_user, icon_gear]
    for idx, nx in enumerate(nav_xs):
        parts += [nav_icons[idx](nx, 520)]
        parts += [svg_text(nx, 560, nav_labels[idx], 10, 450, "middle")]
    parts += [line(555, 576, 589, 576, primary, 2)]

    parts += panel(774, 420, 356, 236, "Spacing Tokens")
    for idx, value in enumerate((8, 16, 24, 32)):
        sx = 818 + idx * 77
        parts += [svg_text(sx + 22, 486, value, 12, 550, "middle")]
        box = 42 + idx * 5
        parts += [rect(sx, 515, box, box, mix(primary, "#FFFFFF", 0.86), radius=0)]
        parts += [line(sx - 4, 510, sx + box + 4, 510, primary, 1, "2 3")]
        parts += [svg_text(sx + box / 2, 620, f"{value} px", 11, 500, "middle")]

    parts += panel(1144, 420, 512, 236, "Radius & Border")
    parts += [svg_text(1166, 499, "Radius", 12, 550), svg_text(1450, 499, "Border", 12, 550)]
    for idx, value in enumerate((4, 8, 12, 16)):
        sx = 1166 + idx * 62
        parts += [rect(sx, 526, 42, 42, "#FFFFFF", primary, 1.5, value)]
        parts += [rect(sx + 6, 532, 30, 30, "none", "#CBD0D5", 1, max(1, value - 3), 'stroke-dasharray="3 3"')]
        parts += [svg_text(sx + 21, 597, value, 11, 500, "middle")]
    parts += [line(1421, 492, 1421, 616, "#D5D8DC", 1)]
    for idx, value in enumerate((1, 2, 3, 4)):
        sx = 1466 + idx * 50
        parts += [line(sx, 530, sx, 572, "#111111", value)]
        parts += [svg_text(sx, 598, value, 11, 500, "middle"), svg_text(sx, 614, "px", 9, 450, "middle")]

    # Bottom row.
    parts += panel(464, 668, 318, 202, "Icon Style")
    icon_xs = [510, 568, 626, 684, 742]
    for idx, ix in enumerate(icon_xs):
        if idx % 4 == 0:
            parts += [icon_house(ix, 762)]
        elif idx % 4 == 1:
            parts += [icon_check(ix, 762, primary)]
        elif idx % 4 == 2:
            parts += [icon_user(ix, 762)]
        else:
            parts += [icon_gear(ix, 762, primary)]
    parts += [svg_text(486, 838, "2 px outline · rounded joins · restrained accents", 11, 450, fill="#656A72")]

    parts += panel(796, 668, 376, 202, "Status Colors")
    statuses = [("Info", "#2F80ED"), ("Success", primary), ("Warning", secondary), ("Error", accent)]
    for idx, (label, color) in enumerate(statuses):
        sx = 818 + idx * 86
        parts += [rect(sx, 735, 72, 76, "#FFFFFF", color, 1.5, 6)]
        parts += [circle(sx + 36, 761, 11, "none", color, 1.5)]
        parts += [svg_text(sx + 36, 765, "!" if label in ("Info", "Warning") else "✓" if label == "Success" else "×", 13, 650, "middle", color)]
        parts += [circle(sx + 17, 797, 3, color, color, 1), svg_text(sx + 25, 801, label, 9, 500)]

    parts += panel(1186, 668, 470, 202, "Design Keywords")
    keyword_colors = [accent, primary, secondary, neutral, accent]
    for idx, keyword in enumerate(tokens["keywords"][:5]):
        sx = 1231 + idx * 86
        color = keyword_colors[idx]
        parts += [circle(sx, 760, 27, mix(color, "#FFFFFF", 0.82), "none", 0)]
        parts += [circle(sx, 760, 10 + (idx % 2) * 3, "none", color, 1.5)]
        short = keyword if len(keyword) <= 11 else keyword[:10] + "…"
        parts += [svg_text(sx, 816, short, 10, 500, "middle")]

    # Metadata footer.
    parts += [rect(24, 884, 1632, 40, "#FFFFFF", "#E7E9EC", 1, 10)]
    metadata = [tokens["name"], "StyleSlice", tokens["source"], tokens["createdAt"], tokens["version"]]
    positions = [130, 450, 828, 1190, 1540]
    for index, (value, px) in enumerate(zip(metadata, positions)):
        parts += [svg_text(px, 910, value, 13, 500, "middle")]
        if index < len(metadata) - 1:
            parts += [circle((positions[index] + positions[index + 1]) / 2, 904, 3, primary, primary, 1)]
    parts.append("</svg>")
    return "\n".join(parts)


def validate_tokens(tokens: dict) -> list[str]:
    errors = []
    colors = tokens.get("colors", [])
    if [item.get("role") for item in colors] != list(ROLE_ORDER):
        errors.append("color roles must be primary, secondary, neutral, accent in that order")
    if len({item.get("hex") for item in colors}) != 4:
        errors.append("the four core colors must be distinct")
    if sum(int(item.get("proportion", 0)) for item in colors) != 100:
        errors.append("color proportions must sum to 100")
    for item in colors:
        value = item.get("hex", "")
        if not isinstance(value, str) or len(value) != 7 or not value.startswith("#"):
            errors.append(f"invalid HEX value: {value}")
    if len(tokens.get("keywords", [])) != 5:
        errors.append("exactly five keywords are required")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path, help="JPG, PNG, or WebP source image")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--analysis", type=Path, help="Optional StyleSlice analysis JSON for semantic naming")
    parser.add_argument("--name", help="Style name shown in metadata")
    parser.add_argument("--source", help="Source label shown in metadata")
    parser.add_argument("--slug", help="Output filename stem")
    args = parser.parse_args()

    if not args.image.is_file():
        parser.error(f"image does not exist: {args.image}")
    if args.image.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        parser.error("image must be JPG, PNG, or WebP")
    if args.analysis and not args.analysis.is_file():
        parser.error(f"analysis JSON does not exist: {args.analysis}")

    tokens = build_tokens(args.image, args.analysis, args.name, args.source)
    errors = validate_tokens(tokens)
    if errors:
        print("Validation failed:\n- " + "\n- ".join(errors), file=sys.stderr)
        return 2

    args.output_dir.mkdir(parents=True, exist_ok=True)
    slug = args.slug or args.image.stem
    json_path = args.output_dir / f"{slug}-tokens.json"
    svg_path = args.output_dir / f"{slug}-style-card.svg"
    png_path = args.output_dir / f"{slug}-style-card.png"
    json_path.write_text(json.dumps(tokens, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    svg_path.write_text(render_svg(tokens), encoding="utf-8")

    converter = shutil.which("rsvg-convert")
    png_created = False
    if converter:
        subprocess.run([converter, "-w", str(WIDTH), "-h", str(HEIGHT), "-o", str(png_path), str(svg_path)], check=True)
        png_created = True

    print(json.dumps({"tokens": str(json_path), "svg": str(svg_path), "png": str(png_path) if png_created else None, "validation": "passed"}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
