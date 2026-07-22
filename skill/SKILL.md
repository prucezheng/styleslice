---
name: generate-ui-style-card
description: Generate a precise, professional palette-focused Style Card from an uploaded PRD and one or more visual-source images. Use when the user asks for a 色卡, Style Card, palette board, color-usage card, or PRD-aligned visual summary that must show only color tokens, color proportions, and design keywords without assuming the source is a UI screen or inventing navigation, controls, icons, typography, or other interface components.
---

# Generate UI Style Card

Create a high-resolution, palette-focused Style Card containing only three information areas: Color System, Color Usage, and Design Keywords.

Read [references/style-card-contract.md](references/style-card-contract.md) before generating.

## Workflow

### 1. Resolve input roles

Assign every input exactly one role:

- **PRD:** define the product purpose, audience, naming, and supported design direction.
- **Visual-source image:** extract only palette, material impression, mood, contrast, and reusable design keywords.
- **Layout-reference image:** control only grid, module proportions, spacing, radius, hierarchy, and documentation-page finish when the user provides one.

Follow the user's explicit labels over attachment order. Treat uploaded visual sources as arbitrary images: they may be posters, illustrations, photographs, products, webpages, or UI screens. Never assume UI-specific structure from the input type.

Never let conversational memory or an older project override the current PRD and current attachments.

### 2. Build a private extraction brief

Before generating, determine:

- 4 concise design keywords supported by the PRD or source image;
- four core roles: Primary, Secondary, Neutral, Accent;
- exact HEX values, avoiding unsupported precision when sampling is unreliable;
- material rules such as flat, matte, soft, crisp, translucent, or paper-like;
- explicit keep and avoid lists.

Do not expose lengthy analysis unless requested.

### 3. Separate extraction from visual inheritance

Treat the visual-source image as evidence, not as a composition template.

Extract:

- dominant and supporting colors;
- saturation, brightness, temperature, and contrast relationships;
- broad mood and design direction;
- defensible material qualities.

Do not inherit unless the user explicitly requests it:

- characters, logos, mascots, objects, or recognizable illustrations;
- hand-drawn lines, doodles, irregular silhouettes, collage, or art decoration;
- the source image's typography, composition, component shapes, interface controls, or page structure;
- phone chrome, watermarks, captions, dates, or platform UI.

### 4. Apply the fixed professional structure

Default to a high-resolution, landscape professional style-guide page with:

- light cool-gray canvas;
- white or near-white rounded modules;
- uniform gaps and radii;
- narrow left color-token column;
- Color Usage module in the remaining upper area;
- Design Keywords module in the remaining lower area;
- crisp, restrained, documentation-like graphics;
- little or no shadow and no decorative hero area.

Do not show typography, UI controls, or product-screen demonstrations.

### 5. Populate exactly three areas

Use only:

1. **Color System:** Primary, Secondary, Neutral, and Accent cards with HEX values and tonal ramps.
2. **Color Usage:** one proportional color bar plus a four-role legend.
3. **Design Keywords:** four concise keyword chips.

Do not add buttons, fields, navigation, spacing tokens, radii, borders, icons, status colors, metadata, typography, full screens, titles, hero illustrations, or invented business copy.

### 6. Generate and inspect

Use the image-generation tool with source and layout references when available. State each reference's role explicitly in the prompt. Prefer English labels to reduce image-text errors unless the user requests Chinese.

After generation, inspect the image at full resolution. Check every item in the contract's QA checklist. If only a local area is wrong, edit that area while preserving all correct regions. Regenerate the whole card only when the grid, hierarchy, or overall style is fundamentally wrong.

### 7. Deliver

Return the rendered PNG image and a direct download link. Briefly state the extracted palette and confirm that no interface components were invented. Do not claim unsupported details.
