# Style Card Contract

Use this contract only to audit or modify the deterministic renderer.

## Output set

Every successful run produces one matched artifact set:

- `{slug}-tokens.json`: single source of truth;
- `{slug}-style-card.svg`: editable vector rendering;
- `{slug}-style-card.png`: 1680 × 945 delivery preview when SVG conversion is available.

Do not deliver artifacts from different runs as one set.

## Palette rules

1. Composite transparency over white and apply EXIF orientation.
2. Downsample to at most 240 × 240 pixels.
3. Use deterministic weighted quantization with no random initialization.
4. Assign roles using measured frequency, saturation, luminance, and distance:
   - Neutral: common, low-chroma, surface-like candidate;
   - Primary: strongest usable combination of frequency and chroma;
   - Accent: saturated, visually separated, relatively scarce candidate;
   - Secondary: remaining candidate balancing frequency and separation.
5. Derive a tonal alternative only when a source is too monochromatic to produce four distinct roles. Mark it with `derived: true` in JSON.
6. Normalize the four displayed proportions to integers totaling exactly 100.
7. Accept a semantic name from optional analysis JSON only when its declared HEX is close to the deterministic sample. Stale analysis must not mislabel the board.
8. Generate the 100–800 ramp only by fixed white/black mixing factors. Never ask a model to invent shades.

## Fixed geometry

- Canvas: 1680 × 945.
- Outer padding: 24 px horizontally, 22 px vertically.
- Left token column: four 416 × 204 cards with 10 px vertical gaps.
- Main grid: three fixed rows plus a 40 px metadata footer.
- Background: cool gray; panels: white with subtle cool-gray border.
- Rendering: flat, crisp, vector-like; no gradients, photos, glass, gloss, or heavy shadows.

The permanent modules are Color Usage, Button States, Input Field, Navigation, Spacing Tokens, Radius & Border, Icon Style, Status Colors, Design Keywords, and metadata. Removing, renaming, or moving one is a template-version change.

## Content constraints

- Four and only four core roles: Primary, Secondary, Neutral, Accent.
- Eight steps per tonal ramp: 100 through 800.
- Button rows: Primary, Secondary, Inverted, Outlined, Disabled.
- Button columns: Default, Hover, Pressed.
- Input states: Default and Focus.
- Spacing: 8, 16, 24, 32 px.
- Radius: 4, 8, 12, 16.
- Border: 1, 2, 3, 4 px.
- Status: Info, Success, Warning, Error.
- Exactly five design keywords.
- Footer fields: style name, StyleSlice, source, date, version.

Exclude typography specimens, font names, type scales, source subjects, poster composition, logos, mascots, illustrations, large prose blocks, and arbitrary extra colors in core roles.

## Acceptance checks

- Renderer reports `validation: passed`.
- Core role order is exact.
- All HEX strings match `^#[0-9A-F]{6}$`.
- Four core HEX values are distinct.
- Proportions total 100.
- SVG and JSON come from the same execution.
- PNG dimensions are 1680 × 945.
- A second identical run yields the same token colors and SVG bytes.
