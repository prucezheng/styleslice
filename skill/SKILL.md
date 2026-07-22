---
name: styleslice
description: Analyze one or more visual-reference images into structured StyleSlice JSON and reusable visual-language Markdown, then generate a consistent Style Card from that shared source. Use when the user asks to analyze an image, extract a style, generate a style specification, create a 色卡 or Style Card, build a UI style guide or design-token board, or run the complete StyleSlice image-to-style workflow. Supports the Chinese triggers “分析这张图”, “提取风格”, “生成风格规范”, “切一下这张图”, and “生成色卡”.
---

# StyleSlice

Turn visual evidence into reusable design rules, then render those same rules as a Style Card. Keep structured JSON as the single source of truth for both Markdown and visuals.

## Route the request

Choose the smallest applicable workflow:

1. **Analyze only:** upload reference images and produce `{name}-analysis.json` plus `{name}-style.md`. Read [references/analyze-workflow.md](references/analyze-workflow.md).
2. **Generate a card only:** use an existing PRD, StyleSlice JSON/Markdown, and any labeled reference images. Read [references/style-card-contract.md](references/style-card-contract.md).
3. **Complete pipeline:** run analysis first, review its evidence and uncertainty, then generate the Style Card from the resulting JSON. Do not re-extract tokens during card generation unless the user explicitly changes them.

## Resolve input authority

Apply this priority order:

1. Current explicit user instructions
2. Current PRD or product requirements
3. Existing StyleSlice JSON and user-confirmed edits
4. Layout-reference image for structure and finish
5. Visual-source image for palette, material impression, mood, and keywords
6. Safe defaults in the relevant reference contract

Never let an older project or conversational memory override current inputs. Follow explicit attachment labels over attachment order. Ask only when ambiguity would materially change the result.

## Preserve the shared data contract

Use the analysis JSON fields as the source for the card:

- `name`, `summary`, and `keywords` define identity and concise metadata;
- `colors` define semantic color names, roles, exact HEX values, and proportions;
- `layout`, `shapes`, and `effects` define visual samples;
- `mustKeep` and `avoid` become positive and negative constraints;
- `uncertainties` prevent unsupported precision;
- `source` and `version` provide provenance.

If a requested card conflicts with the JSON, prefer user-confirmed edits, then report the divergence briefly. Never silently invent a second palette.

## Select the Style Card mode

### Product library card

Use for StyleSlice archive/detail views or when the user asks for the product's native card. Follow the repository PRD:

- create a compact horizontal visual index rather than a full design-system page;
- show style name, summary, 4–6 colors, keywords, a few shape/effect samples, source, date, and version;
- exclude all typography specimens, font names, and type-scale modules;
- keep the information structure consistent across saved styles;
- do not copy the source image as the main visual.

### UI design-system board

Use for “UI Style Card”, “Design Token Reference”, palette board, or a handoff artifact for designers/developers:

- create a high-resolution 16:9, Figma-like modular page;
- default to four semantic roles: Primary, Secondary, Neutral, and Accent;
- include functional token and component-state modules;
- exclude typography specimens, font names, and type-scale modules in every case;
- extract only permitted visual qualities from source images, never their subjects or composition.

Read and apply the detailed contract before generating either mode.

## Generate and verify

1. Build a concise extraction brief from the authoritative inputs.
2. State each reference image's role explicitly in the generation prompt.
3. Use image generation when a rendered card is requested.
4. Inspect the output at full resolution against the contract checklist.
5. Edit a local defect while preserving correct regions; regenerate only when the overall grid or hierarchy fails.
6. Return the rendered image, a direct download link, the palette used, and any important uncertainty.

Do not claim exact color sampling or source attribution when the evidence does not support it. Never restore typography, even when a PRD or reference image contains it.
