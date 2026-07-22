/**
 * 演示兜底数据：AI 调用失败或 DEMO_MODE=1 时使用。
 * 内容质量 = 演示下限，务必打磨（设计师可手改这份数据）。
 */
import type { StyleAnalysis } from "./schema";

export const DEMO_ANALYSIS: StyleAnalysis = {
  name: "暖调极简编辑风",
  summary:
    "以暖白与陶土色为基底、大量留白与克制几何结构构成的编辑风格，气质安静、有纸感。",
  keywords: [
    { word: "纸感暖白", meaning: "背景为带暖调的米白（非纯白），模拟纸张底色，全画面占比最高" },
    { word: "编辑网格", meaning: "类似杂志的清晰网格、分隔线与非对称留白关系" },
    { word: "克制用色", meaning: "全图仅 4 个色相，强调色陶土红只占约 5%，用于关键按钮与标记" },
    { word: "呼吸留白", meaning: "模块之间使用宽松且稳定的间隔，内容集中于画面中央 60% 区域" },
  ],
  colors: [
    { name: "纸感暖白", hex: "#F5F1EA", role: "background", proportion: "约 60%", confidence: "high", evidenceImages: [1, 2] },
    { name: "墨黑", hex: "#1E1B16", role: "primary", proportion: "约 25%", confidence: "high", evidenceImages: [1, 2] },
    { name: "陶土红", hex: "#C4562F", role: "accent", proportion: "约 5%", confidence: "medium", evidenceImages: [1] },
    { name: "灰褐辅助", hex: "#8A8177", role: "secondary", proportion: "约 10%", confidence: "medium", evidenceImages: [2] },
  ],
  layout: {
    density: { value: "低密度，单屏信息点不超过 3 个", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
    whitespace: { value: "模块间使用宽松间隔，页面四周留白 ≥ 内容区宽度的 20%", confidence: "medium", evidenceImages: [1], sourceType: "inferred" },
    visualFocus: { value: "视觉重心偏左上，符合阅读动线；大图不撑满，四周留边", confidence: "medium", evidenceImages: [2], sourceType: "inferred" },
    grid: { value: "12 栏网格，内容常占中间 8 栏，左右不对称留空", confidence: "low", evidenceImages: [1], sourceType: "inferred" },
  },
  shapes: {
    corners: { value: "直角为主，卡片/按钮最多 4px 微小圆角", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
    borders: { value: "1px 细分割线（灰褐色），无边框卡片，靠留白分区", confidence: "high", evidenceImages: [1], sourceType: "direct" },
    form: { value: "纯几何矩形构成，无圆角气泡、无不规则形状", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
  },
  imagery: {
    type: { value: "纪实感摄影，自然光，低饱和", confidence: "medium", evidenceImages: [2], sourceType: "direct" },
    crop: { value: "大图 4:3 或 3:2 裁切，主体居中偏上，不做异形裁切", confidence: "medium", evidenceImages: [2], sourceType: "direct" },
    treatment: { value: "轻微降饱和 + 暖色调，无滤镜感、无颗粒噪点", confidence: "low", evidenceImages: [2], sourceType: "inferred" },
  },
  effects: {
    shadow: { value: "几乎无投影；仅悬浮层允许极浅的单层柔和阴影", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
    texture: { value: "无渐变、无玻璃拟态；背景允许极轻微的纸纹质感", confidence: "low", evidenceImages: [1], sourceType: "inferred" },
  },
  components: [
    { value: "大标题 + 细分隔线 + 两段正文的标题块，反复出现", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
    { value: "陶土红小标签用于分类标记，保持紧凑矩形轮廓", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
  ],
  mustKeep: [
    "暖白背景 + 墨黑文字的高可读性对比",
    "强调色仅用于 5% 以内的关键位置",
    "左对齐与低密度非对称网格",
  ],
  avoid: [
    "纯白 #FFFFFF 或纯黑 #000000",
    "高饱和强调色（亮蓝、荧光绿、紫红）",
    "大圆角（>8px）、气泡形组件、渐变背景",
    "玻璃拟态、厚重投影、多层卡片堆叠",
    "大面积居中堆叠、过密的信息布局",
  ],
  uncertainties: [
    "网格栏数为推断，样本中无完整宽页面佐证",
  ],
};
