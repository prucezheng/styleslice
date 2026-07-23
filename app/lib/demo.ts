/**
 * 演示兜底数据：AI 调用失败或 DEMO_MODE=1 时使用。
 * 数据聚焦于后期处理手法（调色/光影/质感），不含任何画面内容/物体/地标描述。
 */
import type { StyleAnalysis } from "./schema";

export const DEMO_ANALYSIS: StyleAnalysis = {
  name: "暖调褪色胶片风",
  summary:
    "暖调偏橙 + 低饱和褪色 + 细颗粒的胶片后期风格，画面柔和安静，有轻微暗角。",
  keywords: [
    { word: "暖调", meaning: "色温偏暖，画面整体带暖橙色调，白平衡偏移约+10~15" },
    { word: "褪色", meaning: "黑色端提升，暗部偏灰不发死黑，营造旧照片褪色感" },
    { word: "细颗粒", meaning: "全画面叠加均匀细颗粒噪点，模拟ISO 400胶片质感" },
    { word: "柔和高光", meaning: "高光区域柔和不过曝，亮部保留细节" },
    { word: "暗角", meaning: "四角轻微压暗，将注意力引向画面中心" },
  ],
  colors: [
    { name: "暖米白", hex: "#F5F1EA", role: "background", proportion: "约 60%", confidence: "high", evidenceImages: [1] },
    { name: "深褐灰", hex: "#3C312A", role: "primary", proportion: "约 25%", confidence: "high", evidenceImages: [1] },
    { name: "暗橙", hex: "#C47A4A", role: "accent", proportion: "约 5%", confidence: "medium", evidenceImages: [1] },
    { name: "灰褐", hex: "#8A7D72", role: "secondary", proportion: "约 10%", confidence: "medium", evidenceImages: [1] },
  ],
  layout: {
    density: { value: "画面元素稀疏，留白充足", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    whitespace: { value: "大面积留白，内容区域占比偏低", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    visualFocus: { value: "视觉重心偏画面中央偏上", confidence: "medium", evidenceImages: [1], sourceType: "inferred" },
    grid: { value: "宽松的非对称构图", confidence: "low", evidenceImages: [1], sourceType: "inferred" },
  },
  shapes: {
    corners: { value: "直角为主，极微小圆角", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    borders: { value: "细线分割，靠留白而非边框区分区域", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    form: { value: "纯几何构成，简洁利落", confidence: "high", evidenceImages: [1], sourceType: "direct" },
  },
  imagery: {
    type: { value: "自然光摄影", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    crop: { value: "4:3裁切，主体偏上居中", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    treatment: { value: "降饱和 + 色温偏暖偏移 + 均匀细颗粒噪点叠加", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
  },
  effects: {
    shadow: { value: "几乎无投影，画面扁平", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    texture: { value: "轻微纸纹质感 + 细颗粒噪点", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
  },
  components: [
    { value: "简洁矩形区块，留白分隔", confidence: "high", evidenceImages: [1], sourceType: "direct" },
  ],
  mustKeep: [
    "暖色温偏移（偏橙/偏黄）",
    "整体低饱和度，色彩收敛",
    "暗部褪色（黑色端提升，不压死黑）",
    "均匀细颗粒噪点",
  ],
  avoid: [
    "纯白 #FFFFFF 或纯黑 #000000",
    "高饱和强调色（亮蓝、荧光绿、紫红）",
    "厚重投影、多层阴影",
    "锐利高清晰度（破坏柔和感）",
    "大圆角、气泡形、渐变背景",
  ],
  uncertainties: [
    "颗粒强度为推断值，实际需在修图软件中微调",
  ],
};
