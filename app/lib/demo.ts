/**
 * 演示兜底数据：AI 调用失败或 DEMO_MODE=1 时使用。
 * 数据聚焦于设计语言（色彩策略/空间/形态/质感/流派），不含画面内容描述。
 */
import type { StyleAnalysis } from "./schema";

export const DEMO_ANALYSIS: StyleAnalysis = {
  name: "瑞士理性几何风",
  summary:
    "克制的中性色板 + 严格的网格系统 + 硬边几何形态 + 大面积留白，典型的瑞士国际主义设计语言，强调理性秩序与功能性。",
  keywords: [
    { word: "网格系统", meaning: "基于严格数学网格的版式结构，模块化对齐，信息层级清晰" },
    { word: "无衬线几何", meaning: "字体倾向几何化无衬线体，字母结构基于圆形和直线" },
    { word: "呼吸感留白", meaning: "大量负空间，元素间距宽松，留白作为主动设计元素" },
    { word: "不对称平衡", meaning: "通过元素体量对比而非对称实现视觉平衡" },
    { word: "功能优先", meaning: "装饰极简，所有视觉元素服务于信息传达效率" },
  ],
  colors: [
    { name: "冷调白", hex: "#F7F8FA", role: "background", proportion: "约 65%", confidence: "high", evidenceImages: [1] },
    { name: "炭黑", hex: "#1A1C20", role: "primary", proportion: "约 20%", confidence: "high", evidenceImages: [1] },
    { name: "中灰", hex: "#8C9096", role: "secondary", proportion: "约 10%", confidence: "high", evidenceImages: [1] },
    { name: "信号红", hex: "#E03A30", role: "accent", proportion: "约 5%", confidence: "medium", evidenceImages: [1] },
  ],
  layout: {
    density: { value: "信息密度极低，大量留白，单屏信息量克制", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    whitespace: { value: "留白作为核心设计元素，至少占画面 50% 以上", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    visualFocus: { value: "左上到右下的对角线视觉流，主信息居左上", confidence: "medium", evidenceImages: [1], sourceType: "inferred" },
    grid: { value: "严格的模块化网格，12 或 16 列等分，所有元素对齐网格基线", confidence: "high", evidenceImages: [1], sourceType: "inferred" },
  },
  shapes: {
    corners: { value: "纯直角，无任何圆角处理", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    borders: { value: "极细 1px 分割线或无分割线，靠留白和颜色区分区域", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    form: { value: "纯几何矩形构成，拒绝有机曲线和装饰性形状", confidence: "high", evidenceImages: [1], sourceType: "direct" },
  },
  imagery: {
    type: { value: "无图像或极少量几何抽象图形，以文字排版为核心视觉", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    crop: { value: "如有图像采用出血裁切，打破网格边界", confidence: "low", evidenceImages: [1], sourceType: "inferred" },
    treatment: { value: "高对比度黑白或低饱和处理，图像退为背景层次", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
  },
  effects: {
    shadow: { value: "完全无投影，纯扁平化", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    texture: { value: "光滑无纹理，纯色平面", confidence: "high", evidenceImages: [1], sourceType: "direct" },
  },
  components: [
    { value: "严格网格对齐的文本块 + 细线分隔 + 小面积强调色块", confidence: "high", evidenceImages: [1], sourceType: "direct" },
  ],
  designLanguage: {
    movement: "瑞士国际主义",
    confidence: "high",
    rationale: "中性色板+严格网格+无衬线倾向+大面积留白+去装饰化，完全符合瑞士国际主义平面设计流派的核心特征",
  },
  mustKeep: [
    "严格网格对齐系统",
    "大面积留白（负空间占比 50% 以上）",
    "纯直角，无圆角",
    "色彩克制（中性色为主，单色强调）",
    "完全扁平化无投影",
  ],
  avoid: [
    "圆角、气泡形、有机曲线",
    "高饱和多彩色板",
    "渐变背景或渐变元素",
    "投影、模糊、毛玻璃等深度效果",
    "装饰性图案或纹理",
    "居中对齐的对称版式",
  ],
  uncertainties: [
    "网格具体列数（12/16）无法从单图中确定",
    "字体未显式识别，几何无衬线倾向为推断",
  ],
};
