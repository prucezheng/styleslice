---
name: styleslice-analyze
description: 上传设计参考图片 → AI 视觉分析 → 生成结构化 JSON + 通用视觉语言规范 Markdown。触发词：「分析这张图」「提取风格」「生成风格规范」「切一下这张图」「analyze this image」「styleslice」。
---

# StyleSlice 图片风格分析

将设计参考图片上传到 StyleSlice 后端，通过豆包视觉模型分析，生成：

1. **`{name}-analysis.json`** — 完整结构化数据（含 Markdown）
2. **`{name}-style.md`** — 14 节通用视觉语言规范

## 前置条件

1. 确保 Next.js 开发服务器正在运行：
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/styles
   ```
   若非 200，先启动：
   ```bash
   cd app && npm run dev
   ```

2. 确认 `.env.local` 中已配置 `ARK_API_KEY` 和 `ARK_MODEL`（未配置时自动回退演示数据）。

## 执行流程

### 步骤 1：上传图片

```bash
curl -s -X POST http://localhost:3000/api/upload \
  -F "files=@<图片路径>;type=image/jpeg"
```

从返回 JSON 中提取 `images[0].imageId`。

支持格式：JPG / PNG / WebP，单张 ≤ 20MB。

### 步骤 2：AI 分析

```bash
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageIds": ["<imageId>"]}' \
  -o <name>-analysis.json
```

耗时约 30–90 秒（视觉模型），务必设置足够超时（≥ 120s）。

检查 `fallback` 字段：
- `false` → 真实 AI 分析成功
- `true` → 返回兜底演示数据（检查 `fallbackReason`：`missing_config` / `ai_error` / `demo`）

### 步骤 3：提取 Markdown

```bash
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('<name>-analysis.json', 'utf-8'));
fs.writeFileSync('<name>-style.md', data.markdown, 'utf-8');
console.log('Written ' + data.markdown.length + ' chars');
console.log('Style: ' + data.name);
console.log('Fallback: ' + data.fallback);
"
```

### 步骤 4：确认输出

检查生成的两个文件：
- `<name>-analysis.json` — 完整 JSON（含 colors、typography、layout、shapes、imagery、effects、components、mustKeep、avoid、uncertainties + markdown）
- `<name>-style.md` — 14 节固定结构 Markdown

## 多图分析

支持一次上传多张图片进行跨图归纳分析：

```bash
# 步骤 1：上传多张
curl -s -X POST http://localhost:3000/api/upload \
  -F "files=@img1.jpg;type=image/jpeg" \
  -F "files=@img2.jpg;type=image/jpeg"

# 步骤 2：分析时指定重点参考图（primaryImageIds 可选）
curl -s -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"imageIds": ["<id1>","<id2>"], "primaryImageIds": ["<id1>"]}' \
  -o analysis.json
```

## 输出结构

MD 文件固定 14 节：

1. 核心视觉关键词
2. 整体气质与视觉原则
3. 色彩系统与使用比例
4. 字体气质、字重关系与排版层级
5. 构图、网格、间距与留白
6. 形状、轮廓、边框与圆角
7. 图像、摄影或插画语言
8. 材质、纹理和装饰规则
9. 组件与版式母题
10. 必须保持的视觉特征
11. 明确禁止项
12. 提供给 AI 的通用执行规则
13. 来源说明与置信度
14. 不确定项

## 异常处理

| 情况 | 表现 | 处理 |
|------|------|------|
| 服务器未启动 | curl 连接失败 | `cd app && npm run dev` |
| 图片格式不支持 | 422 `failures` 非空 | 转换为 JPG/PNG/WebP |
| AI Key 未配置 | `fallback: true, fallbackReason: "missing_config"` | 设置 `.env.local` 或接受演示数据 |
| AI 调用失败 | `fallback: true, fallbackReason: "ai_error: ..."` | 重试或使用演示数据 |
| 图片 ID 非法 | 400 `非法的图片 ID` | 检查 imageId 格式（正则 `^[a-z]+_[0-9a-f]{12}$`） |

## 注意事项

- 每次分析会重新上传图片到 `app/data/uploads/`，产生新的 imageId。
- 生成的 MD 可保存到资料库：`POST /api/styles`（传入分析结果 JSON）。
- 如需保存到资料库，在步骤 2 后调用：
  ```bash
  curl -s -X POST http://localhost:3000/api/styles \
    -H "Content-Type: application/json" \
    -d @<name>-analysis.json
  ```
