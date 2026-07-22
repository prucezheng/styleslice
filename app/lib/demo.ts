/**
 * 演示兜底数据：AI 调用失败或 DEMO_MODE=1 时使用。
 * 内容质量 = 演示下限，务必打磨（设计师可手改这份数据）。
 */
import type { StyleAnalysis } from "./schema";

export const DEMO_ANALYSIS: StyleAnalysis = {
  name: "暖调极简编辑风",
  summary:
    "以暖白与陶土色为基底、衬线大标题与大量留白构成的编辑排版风格，气质安静、有纸感，强调文字层级而非装饰。",
  keywords: [
    { word: "纸感暖白", meaning: "背景为带暖调的米白（非纯白），模拟纸张底色，全画面占比最高" },
    { word: "编辑排版", meaning: "类似杂志的网格与标题层级，大标题衬线体 + 小号无衬线正文的强对比" },
    { word: "克制用色", meaning: "全图仅 4 个色相，强调色陶土红只占约 5%，用于关键按钮与标记" },
    { word: "呼吸留白", meaning: "模块间距约为正文字号的 4–6 倍，内容集中于画面中央 60% 区域" },
  ],
  colors: [
    { name: "纸感暖白", hex: "#F5F1EA", role: "background", proportion: "约 60%", confidence: "high", evidenceImages: [1, 2] },
    { name: "墨黑", hex: "#1E1B16", role: "primary", proportion: "约 25%", confidence: "high", evidenceImages: [1, 2] },
    { name: "陶土红", hex: "#C4562F", role: "accent", proportion: "约 5%", confidence: "medium", evidenceImages: [1] },
    { name: "灰褐辅助", hex: "#8A8177", role: "secondary", proportion: "约 10%", confidence: "medium", evidenceImages: [2] },
  ],
  typography: {
    category: { value: "标题为高对比衬线体（具体字体待确认），正文为中性无衬线体", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
    weightRelation: { value: "标题 Regular/Medium 即可，靠字号而非字重制造层级；正文 Regular", confidence: "medium", evidenceImages: [1], sourceType: "inferred" },
    hierarchy: { value: "标题 : 副标题 : 正文 ≈ 4 : 2 : 1，层级仅三级，不设第四级", confidence: "medium", evidenceImages: [1, 2], sourceType: "inferred" },
    spacing: { value: "正文行距约为字号 1.6–1.8 倍；标题字距略收紧，正文默认", confidence: "medium", evidenceImages: [2], sourceType: "inferred" },
    alignment: { value: "全部左对齐，不使用居中正文；标题可跨栏", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
  },
  layout: {
    density: { value: "低密度，单屏信息点不超过 3 个", confidence: "high", evidenceImages: [1, 2], sourceType: "direct" },
    whitespace: { value: "模块间距约为正文字号 4–6 倍，页面四周留白 ≥ 内容区宽度的 20%", confidence: "medium", evidenceImages: [1], sourceType: "inferred" },
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
    { value: "陶土红小标签（全大写、字距放宽）用于分类标记", confidence: "medium", evidenceImages: [1], sourceType: "direct" },
  ],
  mustKeep: [
    "暖白背景 + 墨黑文字的高可读性对比",
    "衬线标题与无衬线正文的搭配关系",
    "强调色仅用于 5% 以内的关键位置",
    "左对齐与三级以内的字号层级",
  ],
  avoid: [
    "纯白 #FFFFFF 或纯黑 #000000",
    "高饱和强调色（亮蓝、荧光绿、紫红）",
    "大圆角（>8px）、气泡形组件、渐变背景",
    "玻璃拟态、厚重投影、多层卡片堆叠",
    "居中排列的大段正文、超过三级的字号层级",
  ],
  uncertainties: [
    "标题衬线体的具体字体无法从图片确认，建议用户指定（如思源宋体 / Noto Serif）",
    "网格栏数为推断，样本中无完整宽页面佐证",
  ],
};
