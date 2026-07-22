# StyleSlice 前后端 API 契约

> 前端同学只看这份文档 + `app/lib/schema.ts` 即可开发，无需等后端联调。
> 在 `.env.local` 中设置 `DEMO_MODE=1` 或请求 analyze 时传 `demo: true`，可脱离 AI key 开发。

## 数据类型

完整 TypeScript 类型见 `app/lib/schema.ts`，核心结构：

- `Rule`：`{ value, confidence: high|medium|low, evidenceImages: number[], sourceType: direct|inferred, userEdited?, locked? }`
- `ColorRule`：`{ name, hex, role: primary|secondary|background|accent, proportion, confidence, evidenceImages }`
- `StyleAnalysis`：name / summary / keywords / colors / typography / layout / shapes / imagery / effects / components / mustKeep / avoid / uncertainties
- `StyleResult` = StyleAnalysis + `{ styleId, source, markdown, version, createdAt, updatedAt }`

`evidenceImages` 是图片序号（从 1 开始），按上传顺序对应。

## 接口

### 1. 上传图片 `POST /api/upload`

- 请求：`multipart/form-data`，字段名 `files`（可多文件）
- 限制：JPG/PNG/WebP，单张 ≤ 20MB，一次 ≤ 10 张
- 返回：

```json
{
  "images": [{ "imageId": "image_xxx", "name": "a.png", "size": 12345 }],
  "failures": [{ "name": "b.gif", "reason": "仅支持 JPG / PNG / WebP 格式" }]
}
```

### 2. 分析图片 `POST /api/analyze`

- 请求：

```json
{ "imageIds": ["image_xxx"], "primaryImageIds": ["image_xxx"], "demo": false }
```

- 返回：`StyleAnalysis` + `markdown` + `source` + `fallback`
- `fallback: true` 表示返回的是兜底演示数据（AI 未配置或调用失败），前端可提示"当前为演示数据"
- 耗时较长（视觉模型），前端请设 ≥ 60s 超时并展示阶段进度

### 3. 保存到资料库 `POST /api/styles`

- 请求：`/api/analyze` 返回的整个对象（可含用户编辑后的修改）
- 服务端会**重新渲染 markdown**，保证 MD 与 JSON 一致
- 返回：完整 `StyleResult`（201）

### 4. 资料库列表 `GET /api/styles`

- 返回：`{ styles: StyleResult[] }`（按更新时间倒序）

### 5. 风格详情 `GET /api/styles/:id`

- 返回：`StyleResult`，404 为 `{ error }`

### 6. 更新风格 `PATCH /api/styles/:id`

- 请求：任意 `StyleAnalysis` 字段的子集（如 `{ name: "新名字", colors: [...] }`）
- 未传 `markdown` 时服务端自动重渲染；版本号自动 +1

### 7. 删除风格 `DELETE /api/styles/:id`

- 返回：`{ ok: true }`

## 前端建议

- Style Card 直接由 `StyleResult` 渲染：colors → 色卡，typography → 字体层级示例，shapes/effects → 形态样本
- 图片序号 → 实际图片：需要展示来源图时可另加 `GET /api/images/:imageId`（如需要告诉我，5 分钟补上）
- 编辑保存时直接 PATCH 整个修改后的分析对象即可，MD 会同步
