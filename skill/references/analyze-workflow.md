# StyleSlice Analysis Workflow

Use the local StyleSlice Next.js service to turn one or more images into structured JSON and a 14-section visual-language Markdown document.

## 1. Check prerequisites

Confirm the API is running:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/styles
```

If the result is not `200`, start the app from the repository root:

```bash
cd app && npm run dev
```

Confirm `app/.env.local` contains `ARK_API_KEY` and `ARK_MODEL`. Missing configuration causes demo fallback data.

## 2. Upload images

```bash
curl -s -X POST http://localhost:3000/api/upload \
  -F "files=@<image-path>;type=image/jpeg"
```

Extract `images[].imageId` from the response. Supported formats are JPG, PNG, and WebP, up to 20 MB each.

For multiple images, add one `-F` entry per file. Preserve upload order because `evidenceImages` uses one-based image positions.

## 3. Analyze

```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageIds":["<imageId>"],"primaryImageIds":["<imageId>"]}' \
  -o <name>-analysis.json
```

Allow at least 120 seconds. `primaryImageIds` is optional and marks the most important references.

Inspect the response:

- `fallback: false` means real AI analysis succeeded.
- `fallback: true` means demo data was returned. Check `fallbackReason` for `missing_config`, `ai_error`, or `demo` and disclose it to the user.

## 4. Extract Markdown

```bash
node -e "const fs=require('fs');const p='<name>-analysis.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));fs.writeFileSync('<name>-style.md',d.markdown,'utf8');console.log({name:d.name,fallback:d.fallback,chars:d.markdown.length})"
```

The Markdown contains 14 sections covering keywords, visual principles, color, typography, layout, shapes, imagery, materials, components, must-keep rules, prohibited treatments, reusable AI instructions, evidence/confidence, and uncertainties.

## 5. Validate and optionally save

Confirm the JSON contains `colors`, `typography`, `layout`, `shapes`, `imagery`, `effects`, `components`, `mustKeep`, `avoid`, `uncertainties`, and `markdown`.

Save a successful analysis to the StyleSlice library when requested:

```bash
curl -s -X POST http://localhost:3000/api/styles \
  -H "Content-Type: application/json" \
  -d @<name>-analysis.json
```

Do not present fallback data as a real visual-model result. An invalid image ID must match `^[a-z]+_[0-9a-f]{12}$`; re-upload the source when necessary.
