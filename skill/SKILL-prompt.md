---
name: generate-style-prompt
description: Convert a structured style analysis JSON into a single natural-language AI image-generation prompt. Use when the user asks to generate a prompt, copy a prompt, or create a Midjourney/DALL·E/ComfyUI prompt from a StyleSlice analysis result.
---

# Generate AI Image Prompt

Take a StyleSlice analysis JSON and produce one ready-to-copy image-generation prompt in natural Chinese. The output is a single paragraph — no markdown, no labels, no technical markers.

## Input

A StyleSlice `StyleAnalysis` JSON containing at minimum:

- `name` — style name
- `summary` — one-sentence style definition
- `keywords` — 3–5 word-meaning pairs
- `colors` — 4–6 color rules with name and hex
- `layout` — density, whitespace, visualFocus, grid rules
- `shapes` — corners, borders, form rules
- `imagery` — type, crop, treatment rules
- `effects` — shadow, texture rules
- `mustKeep` — required visual features
- `avoid` — forbidden elements

## Workflow

### 1. Assemble the prompt

Build one flowing paragraph by joining these segments in order, separated by no extra whitespace:

1. **Opening:** `生成一张「{name}」风格的图片。{summary}。`
2. **Color palette:** `使用以下配色方案：{color1 name}（{hex1}）、{color2 name}（{hex2}）、…。`
3. **Core visual keywords:** `{keyword1.meaning}；{keyword2.meaning}；…。`
4. **Composition:** `构图方面：画面{density}，视觉中心放在{visualFocus}，留白方面{whitespace}。`
5. **Shapes:** `形状样式：{corners}，元素形态为{form}，{borders}。`
6. **Imagery:** `图像类型为{imagery.type}。画面上{imagery.treatment}。`
7. **Textures:** `材质纹理：{effects.texture}。阴影方面{effects.shadow}。`
8. **Must-keep:** `一定要保留：{mustKeep joined by ；}。`
9. **Avoid:** `严格避免以下做法：{avoid joined by ；}。`

Skip any segment whose source fields are empty or undefined. Do not leave placeholder text.

### 2. Clean and deliver

- Output only the assembled Chinese text — no quotes, no code block, no prefix.
- No English labels, no JSON keys, no markdown formatting.
- The user should be able to copy the entire response and paste directly into Midjourney, DALL·E, Doubao, or ComfyUI.

## Example

**Input:**
```json
{
  "name": "暖调极简编辑风",
  "summary": "以暖白与陶土色为基底、大量留白与克制几何结构构成的编辑风格",
  "keywords": [
    {"word": "纸感暖白", "meaning": "背景为带暖调的米白，模拟纸张底色"},
    {"word": "克制用色", "meaning": "全图仅4个色相，强调色只占约5%"}
  ],
  "colors": [
    {"name": "纸感暖白", "hex": "#F5F1EA", "role": "background"},
    {"name": "墨黑", "hex": "#1E1B16", "role": "primary"}
  ],
  "layout": {
    "density": {"value": "低密度"},
    "visualFocus": {"value": "偏左上"},
    "whitespace": {"value": "模块间使用宽松间隔"}
  },
  "shapes": {
    "corners": {"value": "直角为主，最多4px微小圆角"},
    "form": {"value": "纯几何矩形"},
    "borders": {"value": "1px细分割线"}
  },
  "imagery": {
    "type": {"value": "纪实感摄影"},
    "treatment": {"value": "轻微降饱和+暖色调"}
  },
  "effects": {
    "texture": {"value": "无渐变、无玻璃拟态"},
    "shadow": {"value": "几乎无投影"}
  },
  "mustKeep": ["暖白背景+墨黑文字的高可读性对比"],
  "avoid": ["纯白#FFFFFF或纯黑#000000", "大圆角>8px"]
}
```

**Output:**
生成一张「暖调极简编辑风」风格的图片。以暖白与陶土色为基底、大量留白与克制几何结构构成的编辑风格。使用以下配色方案：纸感暖白（#F5F1EA）、墨黑（#1E1B16）。背景为带暖调的米白，模拟纸张底色；全图仅4个色相，强调色只占约5%。构图方面：画面低密度，视觉中心放在偏左上，留白方面模块间使用宽松间隔。形状样式：直角为主，最多4px微小圆角，元素形态为纯几何矩形，1px细分割线。图像类型为纪实感摄影。画面上轻微降饱和+暖色调。材质纹理：无渐变、无玻璃拟态。阴影方面几乎无投影。一定要保留：暖白背景+墨黑文字的高可读性对比。严格避免以下做法：纯白#FFFFFF或纯黑#000000；大圆角>8px。
