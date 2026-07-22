# Analysis and Full Workflow

Read this file only for `--mode analyze` or `--mode full`.

## Prerequisites

Run from a StyleSlice repository checkout. Confirm the local API is healthy:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/styles
```

If it is not `200`, start the app from the repository root with `cd app && npm run dev`. Confirm `app/.env.local` contains both `ARK_API_KEY` and `ARK_MODEL`. Normal analysis returns an error when configuration or the visual-model request fails; it must never silently become demo data.

## One-command workflows

Use the same bundled Python runtime as the main skill.

```bash
# JSON + Markdown only
<bundled-python> scripts/styleslice.py <image...> \
  --mode analyze --output-dir <dir>

# JSON + Markdown + token JSON + SVG + PNG
<bundled-python> scripts/styleslice.py <image...> \
  --mode full --output-dir <dir>
```

Accept JPG, PNG, and WebP, at most 10 images and 20 MB per image. Upload order determines `evidenceImages`; the first image is the primary reference and the card color source.

The wrapper uploads the images, calls `/api/analyze`, rejects fallback or typography-bearing responses, writes analysis JSON and Markdown, and passes the same analysis to the deterministic card renderer. Do not repeat those HTTP steps manually unless debugging the wrapper.

## Validate

Require analysis fields `colors`, `layout`, `shapes`, `imagery`, `effects`, `components`, `mustKeep`, `avoid`, `uncertainties`, and `markdown`. Reject any `typography` field.

For full mode, preserve this split of authority:

- deterministic image sampling controls exact HEX values and proportions;
- analysis JSON controls the style name, summary, matching color names, and keywords;
- fixed code controls layout and component states.

Do not present demo or fallback data as real analysis. Do not save the result to the StyleSlice library unless the user explicitly requests persistence.
