---
name: styleslice
description: 上传设计参考图片 → AI 视觉分析 → 生成结构化 StyleSlice JSON + 14 节通用视觉语言规范 Markdown + Style Card。触发词：「分析这张图」「提取风格」「生成风格规范」「切一下这张图」「生成色卡」「styleslice」。
---

# StyleSlice 风格切片

上传设计参考图片，通过豆包视觉模型分析，将"这种感觉"转化为可复用的视觉语言规范。

核心输出：
- **StyleAnalysis JSON** — 结构化风格数据（colors / typography / layout / shapes / imagery / effects / components / mustKeep / avoid / uncertainties）
- **Markdown** — 14 节固定结构通用视觉语言规范
- **Style Card** — 可视化色卡 + 字体层级样本

## Web UI 操作（推荐）

前端已就绪，启动后通过浏览器完成全部操作：

```bash
cd app && npm run dev
```

打开 http://localhost:3000 ，四屏交互流程：

| 屏幕 | 功能 |
|------|------|
| **Home** | 拖拽/点击上传参考图片（支持多图），预览缩略图，点击「Start Analysis」 |
| **Archive** | 资料库卡片堆叠浏览，滚轮/触摸滑动切换，点击打开详情 |
| **Detail** | 风格名+摘要 + 色卡面板（含 hex / 角色 / 占比）+ MD 附件 + 下载 MD/Palette |
| **Markdown** | 完整 Markdown 全文查看 + 浮动下载按钮 |

流程：上传 → 分析（自动调用豆包 AI）→ 自动保存资料库 → 进入 Detail 页 → 下载 MD / 浏览资料库。

### Demo 模式

在 `.env.local` 中设置 `DEMO_MODE=1` 或在分析时传 `demo: true`，可脱离 AI Key 使用演示数据走通全流程。

## API 直调（命令行/脚本用）

前端不可用或需要批量处理时，直接调 API：

### 1. 上传图片

```bash
curl -s -X POST http://localhost:3000/api/upload \
  -F "files=@image.jpg;type=image/jpeg"
# → { "images": [{ "imageId": "image_xxx", "name": "image.jpg", "size": 182730 }] }
```

支持 JPG/PNG/WebP，单张 ≤ 20MB，一次 ≤ 10 张。

### 2. AI 分析

```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageIds": ["image_xxx"], "primaryImageIds": ["image_xxx"]}' \
  -o analysis.json
```

耗时 30–90 秒（视觉模型），超时 ≥ 120s。返回 JSON 含 `markdown` 字段和 `fallback` 标记。

### 3. 提取 Markdown

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('analysis.json', 'utf-8'));
fs.writeFileSync('style.md', data.markdown, 'utf-8');
console.log('Style:', data.name, '| Fallback:', data.fallback);
"
```

### 4. 保存到资料库（可选）

```bash
curl -s -X POST http://localhost:3000/api/styles \
  -H "Content-Type: application/json" \
  -d @analysis.json
# → 201，返回完整 StyleResult（含 styleId）
```

### 5. 资料库 CRUD

```bash
curl http://localhost:3000/api/styles              # GET 列表
curl http://localhost:3000/api/styles/{styleId}    # GET 详情
curl -X PATCH ... -d '{ "name": "新名字" }'        # PATCH 更新（MD 自动重渲染）
curl -X DELETE ...                                  # DELETE 删除
```

## 生成 Style Card

分析完成后，可基于同一份 JSON 生成可视化 Style Card：

### 产品资料库卡片（Detail 页）

前端 `DetailScreen` 已包含：色卡面板（可下载 Palette JSON）+ MD 附件（可下载 .md）+ 风格名/摘要。无需额外操作。

### UI Design Token Board

当用户需要设计系统级别的色卡/Token 参考板时：
- 创建 16:9 高分辨率 Figma 式模块化页面
- 四色语义角色：Primary / Secondary / Neutral / Accent
- 包含 token 命名、组件状态示例
- 默认不包含字体样本（除非用户明确要求）
- 从 JSON 的 `colors` 提取 hex/role/proportion，`shapes` 提取圆角/边框，`effects` 提取阴影/纹理

## 数据契约

分析 JSON 字段作为 Style Card 的唯一数据源：

| 字段 | 用途 |
|------|------|
| `name` / `summary` / `keywords` | 风格标识和一句话定义 |
| `colors[]` | { name, hex, role, proportion, confidence } — 用于色卡 |
| `typography` | 字体类别/字重/层级/间距/对齐 — 用于字体样本 |
| `layout` | 密度/留白/视觉重心/网格 |
| `shapes` | 圆角/边框/形态语言 |
| `imagery` | 图像类型/裁切/处理 |
| `effects` | 阴影/纹理 |
| `components[]` | 反复出现的版式母题 |
| `mustKeep[]` / `avoid[]` | 正向/负向约束 |
| `uncertainties[]` | 不确定项，避免过度精确 |
| `source.imageIds` | 证据溯源 |

## 异常处理

| 情况 | Web UI 表现 | API 表现 |
|------|------------|---------|
| 服务器未启动 | 无法访问 | `cd app && npm run dev` |
| 图片格式不支持 | 自动过滤，提示用户 | 422 + failures 列表 |
| AI Key 未配置 | fallback 为演示数据 | `fallback: true, reason: "missing_config"` |
| AI 调用超时/失败 | 显示错误信息 | `fallback: true, reason: "ai_error: ..."` |
| 资料库 styles.json 损坏 | — | 自动备份 .broken-{timestamp} 后报错 |

## 原则

- **JSON 是唯一数据源**：Markdown 和 Style Card 均由同一份 JSON 渲染，不允许各自独立生成相同内容
- **不编造**：字体无法识别时只说类别（如"高对比衬线体"），不确定项写入 `uncertainties`
- **不照搬**：提取视觉规则，不复制原图内容/构图/具体品牌元素
- **优先用户编辑**：用户手动修改过的字段覆盖 AI 原始输出
- Do not claim exact color sampling or source attribution when the evidence does not support it. Never restore typography, even when a PRD or reference image contains it.
