/**
 * StyleSlice 统一数据契约（前后端唯一数据源）
 * AI 输出 JSON → 同一份 JSON 渲染 MD 与 Style Card
 * 对应 PRD 第 9 节
 */

export type Confidence = "high" | "medium" | "low";
export type SourceType = "direct" | "inferred"; // 直接识别 / AI 归纳

/** 单条规则：内容 + 置信度 + 证据 + 来源类型 + 用户状态（PRD 9.2） */
export interface Rule<T = string> {
  value: T;
  confidence: Confidence;
  /** 证据来源图片序号（从 1 开始，对应上传顺序） */
  evidenceImages: number[];
  sourceType: SourceType;
  userEdited?: boolean;
  locked?: boolean;
}

export interface ColorRule {
  name: string; // 如 "暖白背景"
  hex: string; // 如 "#F5F1EA"
  role: "primary" | "secondary" | "background" | "accent";
  proportion: string; // 如 "约 40%"
  confidence: Confidence;
  evidenceImages: number[];
}

export interface LayoutSpec {
  density: Rule; // 信息密度
  whitespace: Rule; // 留白
  visualFocus: Rule; // 视觉重心
  grid: Rule; // 网格与对称关系
}

export interface ShapeSpec {
  corners: Rule; // 圆角
  borders: Rule; // 边框/线条粗细
  form: Rule; // 几何/有机形态
}

export interface ImagerySpec {
  type: Rule; // 摄影/插画类型
  crop: Rule; // 裁切方式
  treatment: Rule; // 滤镜/颗粒/对比度/背景处理
}

export interface EffectSpec {
  shadow: Rule;
  texture: Rule; // 渐变/玻璃/纸张/噪点等
}

/** 设计流派/运动识别 */
export interface DesignLanguage {
  movement: string; // 识别到的设计流派名称，如"包豪斯""孟菲斯""瑞士国际主义"
  confidence: Confidence;
  rationale: string; // 匹配依据
}

/** AI 分析输出的核心结构（/api/analyze 的返回，保存前） */
export interface StyleAnalysis {
  name: string; // 风格名称（AI 生成，用户可改）
  summary: string; // 一句话风格定义
  keywords: { word: string; meaning: string }[]; // 3–5 个
  colors: ColorRule[]; // 4–6 个
  layout: LayoutSpec;
  shapes: ShapeSpec;
  imagery: ImagerySpec;
  effects: EffectSpec;
  components: Rule[]; // 反复出现的组件/版式母题
  designLanguage?: DesignLanguage; // 识别到的设计流派（可选，非所有图片都有明显流派）
  mustKeep: string[]; // 必须保持的视觉特征
  avoid: string[]; // 明确禁止项
  uncertainties: string[]; // 不确定项
}

/** 完整风格对象（资料库中保存的） */
export interface StyleResult extends StyleAnalysis {
  styleId: string;
  source: {
    imageIds: string[];
    primaryImageIds: string[]; // 重点参考
  };
  markdown: string; // 由 renderMarkdown() 生成
  prompt: string;   // 由 renderPrompt() 生成（完整版 AI 生图提示词）
  promptShort: string; // 由 renderPromptShort() 生成（精简版，≤120字）
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** 发给 AI 的 JSON 输出模板（Prompt 中使用） */
export const ANALYSIS_JSON_TEMPLATE = `{
  "name": "风格名称（简短，如「暖调极简编辑风」）",
  "summary": "一句话风格定义",
  "keywords": [{ "word": "关键词", "meaning": "该关键词在此风格中的具体含义" }],
  "colors": [
    {
      "name": "颜色用途名",
      "hex": "#RRGGBB",
      "role": "primary | secondary | background | accent",
      "proportion": "约 xx%",
      "confidence": "high | medium | low",
      "evidenceImages": [1]
    }
  ],
  "layout": {
    "density": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "whitespace": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "visualFocus": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "grid": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." }
  },
  "shapes": {
    "corners": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "borders": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "form": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." }
  },
  "imagery": {
    "type": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "crop": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "treatment": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." }
  },
  "effects": {
    "shadow": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." },
    "texture": { "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." }
  },
  "components": [{ "value": "...", "confidence": "...", "evidenceImages": [1], "sourceType": "..." }],
  "designLanguage": { "movement": "识别到的设计流派（包豪斯/孟菲斯/瑞士国际主义/粗野主义/极简主义等，无明显流派时填null）", "confidence": "high | medium | low", "rationale": "为什么判断为该流派的依据" },
  "mustKeep": ["必须保持的视觉特征"],
  "avoid": ["明确禁止项"],
  "uncertainties": ["不确定项"]
}`;
