---
name: styleslice
description: Unified StyleSlice workflow for turning one or more JPG, PNG, or WebP design references into deterministic UI Style Cards, validated color-token JSON, optional evidence-based visual analysis JSON, and reusable visual-language Markdown. Use for “生成色卡”, “提取配色”, “分析这张图”, “提取风格”, “生成风格规范”, “切一下这张图”, Style Card, design tokens, palette boards, and complete image-to-style handoff requests. Replaces separate analysis and card-generation skills with one fixed entry point and one shared contract.
---

# StyleSlice 风格切片

Use one entry point for every StyleSlice task. Keep the bundled renderer authoritative for sampled colors, role assignment, tonal ramps, geometry, and validation.

## Select one mode

- **Card — default:** Turn one image directly into PNG, SVG, and token JSON. Use unless the user explicitly asks for written style analysis.
- **Analyze:** Turn 1–10 images into analysis JSON and visual-language Markdown through the repository API.
- **Full:** Analyze 1–10 images, then render the first image into a card enriched by the same analysis JSON.

Do not run separate legacy workflows. `scripts/styleslice.py` is the only user-facing entry point; `scripts/render_style_card.py` is its internal deterministic renderer.

## Execute

1. Call `codex_app__load_workspace_dependencies` and use its bundled Python executable because it includes Pillow and NumPy.
2. Resolve the current image path and choose an output directory.
3. Run exactly one command:

```bash
# Default: fastest deterministic color card
<bundled-python> scripts/styleslice.py <image> --output-dir <dir>

# Complete analysis + card
<bundled-python> scripts/styleslice.py <image...> --mode full --output-dir <dir>

# Analysis only
<bundled-python> scripts/styleslice.py <image...> --mode analyze --output-dir <dir>
```

Add `--name`, `--source`, or `--slug` only when the user supplies or needs those labels. Add `--analysis <json>` in card mode only when matching StyleSlice analysis already exists.

For `analyze` and `full`, read [references/analyze-workflow.md](references/analyze-workflow.md) before execution. The local repository API must be available. For renderer changes or audits, read [references/style-card-contract.md](references/style-card-contract.md).

## Preserve authority

Apply this order:

1. Current explicit user instructions
2. User-confirmed StyleSlice JSON edits
3. Deterministically sampled image colors
4. Matching analysis names and keywords
5. Fixed template defaults

Never let model-estimated HEX values replace sampled HEX values. Accept an analysis color name only when its declared HEX is close to the sampled color. Never invent a second palette.

## Enforce invariants

- Keep the card at 1680 × 945 with template ID `styleslice-ui-board-v1`.
- Keep exactly four distinct core roles in this order: Primary, Secondary, Neutral, Accent.
- Require uppercase HEX values and integer proportions totaling 100%.
- Keep eight tonal steps labeled 100–800 for every core role.
- Keep exactly five design keywords.
- Keep all fixed modules, spacing values 8/16/24/32, radii 4/8/12/16, and borders 1/2/3/4.
- Exclude typography specimens, font recommendations, source subjects, logos, poster composition, and decorative hero content.
- Never use generative image rendering for the board.
- Never hand-edit the output SVG or PNG. Fix the source tokens or renderer, then rerun.

## Deliver

Require the command to end with `"validation": "passed"`. Inspect the PNG at full resolution, then return every generated artifact:

- Card: `*-style-card.png`, `*-style-card.svg`, `*-tokens.json`
- Analyze: `*-analysis.json`, `*-style.md`
- Full: all five files

Confirm printed HEX values match JSON, proportions total 100%, PNG dimensions are 1680 × 945, and no label is clipped. Re-running the same card command on the same input must produce identical JSON colors and SVG bytes except for explicitly changed metadata.
