# Style Card Contract

## Contents

- Input and token rules
- Product library card
- UI design-system board
- Prompt construction
- Quality checks

## Input and token rules

Use current explicit instructions first, followed by the PRD, existing StyleSlice JSON, layout references, and visual sources. Treat a visual-source image as evidence, not a composition template.

Extract only:

- dominant and supporting colors;
- saturation, brightness, temperature, and contrast relationships;
- broad mood and defensible design keywords;
- material qualities such as flat, matte, soft, crisp, translucent, or paper-like.

Do not inherit characters, logos, mascots, objects, recognizable illustrations, hand-drawn lines, doodles, irregular silhouettes, collage, source typography, source composition, component shapes, phone chrome, watermarks, captions, dates, or platform UI unless explicitly requested.

Use exact HEX values from StyleSlice JSON when available. If sampling is unreliable, avoid unsupported precision and surface the uncertainty.

## Product library card

Create a compact horizontal visual index for StyleSlice archive and detail views.

Include:

- style name and short summary;
- 4–6 representative colors and HEX values;
- 1–3 compact layout samples showing spacing, alignment, grid, or density;
- a few line, radius, shadow, texture, or basic-form samples;
- compact source, creation date, and version metadata.

Keep the card's structure stable across styles. Make colors and functional visual tokens dominant. Do not simulate a complete app or poster, and do not use the source image itself as the main visual.

## UI design-system board

Create a high-resolution 16:9 Figma-like documentation page:

- light cool-gray canvas;
- white or near-white rounded modules;
- uniform 16–24 px-equivalent gaps and consistent radii;
- a narrow left token column and a larger modular grid;
- crisp vector-like UI samples, subtle borders, little or no shadow, and no decorative hero.

### Token column

Show Primary, Secondary, Neutral, and Accent. Each token contains a semantic name, exact HEX, a large swatch, and an orderly 100–800 tonal ramp when space permits. Use high-contrast labels.

If StyleSlice JSON uses `background` instead of `neutral`, map the background color to Neutral/Surface and preserve its original semantic name in metadata. Do not invent additional core roles merely to fill space.

### Functional modules

Choose a balanced, non-repetitive set:

- Color Usage with proportional bars and a four-role legend;
- Button States: Primary, Secondary, Inverted, Outlined, Disabled;
- Input Field: default and focus states;
- Navigation with 3–4 coherent outline icons;
- Spacing Tokens: 8, 16, 24, 32;
- Radius & Border: radii 4, 8, 12, 16 and borders 1–4 px;
- Icon Style with 4–5 minimal outline icons;
- subordinate Info, Success, Warning, and Error colors;
- 3–5 evidence-based Design Keywords;
- compact product/style, source, date, and version metadata.

Always exclude typography specimens, `Aa`, Headline, Body, Label, font sections, font names, font weights, and type scales. Do not restore typography in either card mode, even when it appears in a PRD or reference.

Reject illustration-poster composition, doodles, collage, recognizable source subjects, decorative hero graphics, glassmorphism, 3D, gloss, heavy shadows, arbitrary gradients, copied source components, full app screens, and large explanatory text blocks.

## Prompt construction

Build prompts in this order:

1. **Reference roles:** identify the layout controller and palette/keyword sources.
2. **Extracted tokens:** list semantic roles and exact HEX values.
3. **Fixed structure:** specify the selected mode, canvas, grid, modules, and permanent typography exclusion.
4. **Negative constraints:** list forbidden inherited forms and art treatments.

Never rely only on phrases such as “like image 1”; describe each reference's permitted scope.

## Quality checks

Verify at full resolution:

- semantic colors, printed HEX values, and swatches agree;
- tonal ramps stay within the correct hue families;
- no typography specimen, font name, type scale, `Aa`, Headline, Body, or Label module appears;
- no source subject, logo, mascot, illustration, doodle, or composition is copied;
- hierarchy, alignment, gutters, radii, and labels are consistent and legible;
- samples are functional and do not become a full app screen;
- metadata is compact and the image is sharp enough for design handoff.

Perform a local edit if only one area fails. Regenerate when the grid, hierarchy, or more than three checklist groups fail.
