# One-Minute User Journey HTML Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline, 16:9, four-slide HTML presentation that shows the StyleSlice user journey in under one minute using the four supplied product screenshots.

**Architecture:** A self-contained presentation directory contains one `index.html`, four local PNG assets, and one Node-based acceptance test. CSS and JavaScript stay inline in the HTML; the test checks narrative order, asset references, navigation hooks, fullscreen support, and offline-only dependencies.

**Tech Stack:** Semantic HTML, CSS, vanilla JavaScript, Node.js built-in test/assert modules, Microsoft Edge headless screenshots for visual QA.

---

### Task 1: Create the acceptance test and local assets

**Files:**
- Create: `demo/user-journey-pitch/test.mjs`
- Create: `demo/user-journey-pitch/assets/upload.png`
- Create: `demo/user-journey-pitch/assets/analysis.png`
- Create: `demo/user-journey-pitch/assets/archive.png`
- Create: `demo/user-journey-pitch/assets/persona.png`

- [ ] **Step 1: Write the failing acceptance test**

Create `test.mjs` with Node built-ins. The test must read `index.html`, assert exactly four `<section class="slide">` elements, verify the four step labels and image paths are ordered correctly, reject `http://`/`https://` dependencies, and assert keyboard, pointer, touch, fullscreen, and `aria-live` hooks are present.

- [ ] **Step 2: Run the test and verify RED**

Run: `node demo/user-journey-pitch/test.mjs`

Expected: FAIL with `ENOENT` for `demo/user-journey-pitch/index.html`.

- [ ] **Step 3: Copy the four approved screenshots into stable local asset paths**

Run PowerShell `Copy-Item -LiteralPath` for these mappings:

```text
C:\Users\wuhanqing\Desktop\大区赛\design\1.png -> demo/user-journey-pitch/assets/upload.png
C:\Users\wuhanqing\Desktop\大区赛\design\2.png -> demo/user-journey-pitch/assets/analysis.png
C:\Users\wuhanqing\Desktop\大区赛\design\3.png -> demo/user-journey-pitch/assets/archive.png
C:\Users\WUHANQ~1\AppData\Local\Temp\codex-clipboard-9fd224da-6ee6-4fd4-8fc4-2e457d471da6.png -> demo/user-journey-pitch/assets/persona.png
```

- [ ] **Step 4: Verify all asset files exist and are non-empty**

Run: `Get-ChildItem demo/user-journey-pitch/assets | Select-Object Name,Length`

Expected: four PNG files with `Length > 0`.

### Task 2: Build the four-slide HTML presentation

**Files:**
- Create: `demo/user-journey-pitch/index.html`
- Test: `demo/user-journey-pitch/test.mjs`

- [ ] **Step 1: Implement the minimal HTML that satisfies the narrative test**

Create a valid Chinese-language HTML document with four ordered slide sections:

```text
01 上传截图 — 把喜欢的截图，交给 StyleSlice。
02 AI 拆解 — AI 拆出色彩、构图与风格语言。
03 收藏复用 — 收藏成切片，让灵感随时能被找回。
04 审美沉淀 — 积累的不是图片，而是你的审美画像。
```

Each slide references its matching local image. Include a fixed brand mark, four-part progress control, current page indicator, previous/next click zones, and fullscreen button.

- [ ] **Step 2: Add inline responsive styling**

Use a 16:9 `.stage` scaled with `width: min(100vw, calc(100vh * 16 / 9))` and `aspect-ratio: 16 / 9`. Keep black/white as the base and `#18b763` as the only emphasis color. Use a two-column editorial composition, large Chinese display type, a contained phone screenshot, and breakpoint adjustments below 900px without hiding slide content.

- [ ] **Step 3: Add inline interaction logic**

Implement `goTo(index)`, `next()`, `previous()`, and `toggleFullscreen()`. Bind ArrowLeft/ArrowRight/Space, left/right click zones, progress buttons, touch swipe with a 50px threshold, and the fullscreen button. Keep manual navigation as the default.

- [ ] **Step 4: Run the acceptance test and verify GREEN**

Run: `node demo/user-journey-pitch/test.mjs`

Expected: PASS with a summary confirming four slides, four local assets, navigation hooks, fullscreen, accessibility status, and no remote dependencies.

### Task 3: Perform browser and visual QA

**Files:**
- Verify: `demo/user-journey-pitch/index.html`
- Create only as temporary QA output: screenshots outside the repository or under the task scratch directory.

- [ ] **Step 1: Start a local static server**

Run from `demo/user-journey-pitch`: `python -m http.server 4175` in a hidden background process.

Expected: `http://127.0.0.1:4175/` returns the presentation.

- [ ] **Step 2: Capture all four slides at 1920×1080**

Use a headless local browser with the query parameter `?slide=1` through `?slide=4`, capturing one PNG per slide.

- [ ] **Step 3: Inspect every slide individually**

Confirm no text clipping, accidental overlap, image cropping that removes essential UI, or controls outside the safe area. Correct CSS and repeat screenshots when needed.

- [ ] **Step 4: Verify 1366×768 and 1440×900 layouts**

Capture the first and fourth slides at both viewport sizes and confirm the full 16:9 stage remains visible with intentional letterboxing only.

- [ ] **Step 5: Re-run the acceptance test**

Run: `node demo/user-journey-pitch/test.mjs`

Expected: PASS with no warnings.

### Task 4: Final verification and commit

**Files:**
- Verify: `demo/user-journey-pitch/index.html`
- Verify: `demo/user-journey-pitch/test.mjs`
- Verify: `demo/user-journey-pitch/assets/*.png`

- [ ] **Step 1: Confirm repository scope**

Run: `git status --short`

Expected: only the implementation plan and the new `demo/user-journey-pitch/` deliverable are part of this task; existing unrelated untracked files remain untouched.

- [ ] **Step 2: Run final offline acceptance test**

Run: `node demo/user-journey-pitch/test.mjs`

Expected: PASS.

- [ ] **Step 3: Commit only task files**

```text
git add docs/superpowers/plans/2026-07-23-one-minute-user-journey-html.md demo/user-journey-pitch
git commit -m "feat: add one-minute user journey presentation"
```
