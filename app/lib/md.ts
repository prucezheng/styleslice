/**
 * JSON → 通用视觉语言规范 Markdown 渲染器
 * 固定 13 节结构（排除 Typography），由代码渲染保证结构稳定，不让 AI 自由写 MD。
 */
import type { StyleAnalysis, Rule } from "./schema";

const CONF_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

function fmtRule(r: Rule | undefined): string {
  if (!r || !r.value) return "（未识别）";
  const evidence =
    r.evidenceImages?.length > 0 ? `（证据：图片 ${r.evidenceImages.join("、")}）` : "";
  const src = r.sourceType === "inferred" ? "［推断］" : "";
  return `${r.value}${src}${evidence}`;
}

function fmtList(items: string[]): string {
  if (!items || items.length === 0) return "- （无）";
  return items.map((i) => `- ${i}`).join("\n");
}

/**
 * JSON → AI 生图精简提示词（≤120 字，可直接复制到 Midjourney / DALL·E / 豆包等工具）
 * 自然语言正向指令，不含 markdown 标记，不对原图做分析性描述
 */
export function renderPromptShort(a: StyleAnalysis): string {
  const colorHexes = (a.colors ?? [])
    .slice(0, 4)
    .map((c) => c.hex)
    .join("、");

  const styleDesc = a.summary;
  const keywordStr = (a.keywords ?? [])
    .slice(0, 3)
    .map((k) => k.word)
    .join("、");

  const parts: string[] = [];

  // 开场：风格名 + 气质
  parts.push(`${a.name}风格，${styleDesc}`);

  // 配色
  if (colorHexes) {
    parts.push(`配色${colorHexes}`);
  }

  // 关键词
  if (keywordStr) {
    parts.push(`${keywordStr}`);
  }

  // 构图（精简）
  const layoutHints: string[] = [];
  if (a.layout?.whitespace?.value) {
    const v = a.layout.whitespace.value;
    // 转换为正向指令
    if (/大|多|充足|宽阔/.test(v)) layoutHints.push("大面积留白");
    else if (/小|少|紧凑|密集/.test(v)) layoutHints.push("紧凑布局");
    else layoutHints.push(v.replace(/留白|方面|画面/g, ""));
  }
  if (a.layout?.density?.value) {
    const v = a.layout.density.value;
    if (/低|稀疏|少/.test(v)) layoutHints.push("元素稀疏");
    else if (/高|密集|多/.test(v)) layoutHints.push("信息密集");
  }

  // 形状
  const shapeHints: string[] = [];
  if (a.shapes?.corners?.value) {
    const v = a.shapes.corners.value;
    if (/圆|弧|曲/.test(v)) shapeHints.push("圆角");
    else if (/方|直|锐|直角/.test(v)) shapeHints.push("直角");
  }

  // 材质
  const textureHints: string[] = [];
  if (a.effects?.texture?.value) {
    const v = a.effects.texture.value;
    if (/玻璃|毛玻璃/.test(v)) textureHints.push("毛玻璃质感");
    else if (/噪点|颗粒/.test(v)) textureHints.push("颗粒纹理");
    else if (/阴影/.test(v) || a.effects?.shadow?.value) textureHints.push("柔和阴影");
    else if (/扁平|无阴影/.test(v)) textureHints.push("扁平无阴影");
    else if (v.length < 12) textureHints.push(v);
  }

  const allHints = [...layoutHints, ...shapeHints, ...textureHints];
  if (allHints.length) {
    parts.push(allHints.join("，"));
  }

  // 禁止项（精简为 1-2 个最关键）
  const topAvoid = (a.avoid ?? []).slice(0, 2);
  if (topAvoid.length) {
    parts.push(`避免${topAvoid.join("、")}`);
  }

  // 拼接并截断到约 120 字
  let result = parts.join("，");
  if (result.length > 140) {
    result = result.slice(0, 137).replace(/，[^，]*$/, "") + "…";
  }
  return result;
}

/**
 * JSON → AI 生图完整提示词（普通用户可直复制粘贴到 Midjourney / DALL·E / 豆包 等）
 * 自然语言正向指令段落，不含 markdown 标记，不出现分析性措辞
 */
export function renderPrompt(a: StyleAnalysis): string {
  const colorList = (a.colors ?? [])
    .map((c) => `${c.name}（${c.hex}）`)
    .join("、");

  const keywordMeanings = (a.keywords ?? []).map((k) => k.meaning).join("；");

  const parts: string[] = [];

  // 开场：正向指令
  parts.push(
    `生成一张「${a.name}」风格的图片。${a.summary}。`
  );

  // 配色（指令语气）
  if (colorList) {
    parts.push(`使用${colorList}的配色方案。`);
  }

  // 核心视觉元素（用 meaning 代替 word，更具体）
  if (keywordMeanings) {
    parts.push(`${keywordMeanings}。`);
  }

  // 构图与布局（正向指令化）
  const layoutClues: string[] = [];
  if (a.layout?.density?.value) {
    layoutClues.push(toInstruction(a.layout.density.value));
  }
  if (a.layout?.visualFocus?.value) {
    layoutClues.push(`视觉中心置于${toInstruction(a.layout.visualFocus.value)}`);
  }
  if (a.layout?.whitespace?.value) {
    layoutClues.push(toInstruction(a.layout.whitespace.value));
  }
  if (a.layout?.grid?.value) {
    layoutClues.push(toInstruction(a.layout.grid.value));
  }
  if (layoutClues.length) {
    parts.push(`构图：${layoutClues.join("，")}。`);
  }

  // 形状与形态
  const shapeClues: string[] = [];
  if (a.shapes?.corners?.value) shapeClues.push(toInstruction(a.shapes.corners.value));
  if (a.shapes?.form?.value) shapeClues.push(`元素形态${toInstruction(a.shapes.form.value)}`);
  if (a.shapes?.borders?.value) shapeClues.push(toInstruction(a.shapes.borders.value));
  if (shapeClues.length) {
    parts.push(`形状样式：${shapeClues.join("，")}。`);
  }

  // 图像风格
  if (a.imagery?.type?.value) {
    parts.push(`图像类型：${toInstruction(a.imagery.type.value)}。`);
  }
  if (a.imagery?.crop?.value) {
    parts.push(`裁切方式：${toInstruction(a.imagery.crop.value)}。`);
  }
  if (a.imagery?.treatment?.value) {
    parts.push(`画面处理：${toInstruction(a.imagery.treatment.value)}。`);
  }

  // 材质纹理
  if (a.effects?.texture?.value) {
    parts.push(`材质纹理：${toInstruction(a.effects.texture.value)}。`);
  }
  if (a.effects?.shadow?.value) {
    parts.push(`阴影：${toInstruction(a.effects.shadow.value)}。`);
  }

  // 组件母题（如有）
  if ((a.components ?? []).length > 0) {
    const comps = a.components
      .map((c) => toInstruction(c.value))
      .filter(Boolean)
      .join("，");
    if (comps) parts.push(`包含以下视觉元素：${comps}。`);
  }

  // 必须保留
  if ((a.mustKeep ?? []).length) {
    parts.push(`必须保留：${a.mustKeep.map((s) => toInstruction(s)).join("；")}。`);
  }

  // 避免
  if ((a.avoid ?? []).length) {
    parts.push(`严格避免：${a.avoid.map((s) => toInstruction(s)).join("；")}。`);
  }

  return parts.join("");
}

/**
 * 将分析性描述转换为正向指令语气
 * "画面信息密度较低" → "信息密度较低"
 * "大面积留白" → "大量留白空间" (keep as is for positive instructions)
 * Already instructional phrases pass through unchanged
 */
function toInstruction(text: string): string {
  // 去掉分析性前缀
  let cleaned = text
    .replace(/^画面中[，,]?\s*/g, "")
    .replace(/^可以看出[，,]?\s*/g, "")
    .replace(/^原图[中]?[的]?[，,]?\s*/g, "")
    .replace(/^图片[中]?[的]?[，,]?\s*/g, "")
    .replace(/^该风格[中]?[的]?[，,]?\s*/g, "")
    .replace(/^通过[^，,]*[可以看出，,]*\s*/g, "")
    .replace(/留白方面/g, "留白")
    .replace(/阴影方面/g, "阴影")
    .replace(/构图方面[：:]?\s*/g, "")
    .trim();

  // 确保以正向动词/形容词开头，去掉弱化描述
  if (cleaned.endsWith("。")) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
}

export function renderMarkdown(a: StyleAnalysis): string {
  const roleLabel: Record<string, string> = {
    primary: "主色",
    secondary: "辅助色",
    background: "背景色",
    accent: "强调色",
  };

  const colorLines = (a.colors ?? [])
    .map(
      (c) => {
        const evidence =
          c.evidenceImages?.length > 0 ? `图片 ${c.evidenceImages.join("、")}` : "—";
        return `| ${roleLabel[c.role] ?? c.role} | ${c.name} | \`${c.hex}\` | ${c.proportion} | ${CONF_LABEL[c.confidence] ?? c.confidence} | ${evidence} |`;
      }
    )
    .join("\n");

  return `# ${a.name}

> ${a.summary}

## 1. 核心视觉关键词

${(a.keywords ?? []).map((k) => `- **${k.word}**：${k.meaning}`).join("\n")}

## 2. 整体气质与视觉原则

${a.summary}

本规范只定义视觉语言，不绑定任何具体项目类型（App / 网页 / 海报均可适用）。具体项目的内容、布局与功能需在使用本规范时另行提供。

## 3. 色彩系统与使用比例

| 角色 | 名称 | 色值 | 占比 | 置信度 | 证据 |
| --- | --- | --- | --- | --- | --- |
${colorLines}

## 4. 构图、网格、间距与留白

- **信息密度**：${fmtRule(a.layout?.density)}
- **留白**：${fmtRule(a.layout?.whitespace)}
- **视觉重心**：${fmtRule(a.layout?.visualFocus)}
- **网格与对称**：${fmtRule(a.layout?.grid)}

## 5. 形状、轮廓、边框与圆角

- **圆角**：${fmtRule(a.shapes?.corners)}
- **边框与线条**：${fmtRule(a.shapes?.borders)}
- **形态语言**：${fmtRule(a.shapes?.form)}

## 6. 图像、摄影或插画语言

- **图像类型**：${fmtRule(a.imagery?.type)}
- **裁切方式**：${fmtRule(a.imagery?.crop)}
- **处理方式**：${fmtRule(a.imagery?.treatment)}

## 7. 材质、纹理和装饰规则

- **阴影**：${fmtRule(a.effects?.shadow)}
- **纹理与材质**：${fmtRule(a.effects?.texture)}

## 8. 组件与版式母题

${(a.components ?? []).length > 0 ? a.components.map((c) => `- ${fmtRule(c)}`).join("\n") : "- （无明显重复组件）"}

## 9. 必须保持的视觉特征

${fmtList(a.mustKeep)}

## 10. 明确禁止项

${fmtList(a.avoid)}

## 11. 提供给 AI 的通用执行规则

- 以上所有规则适用于任何设计载体；执行时优先保证「必须保持的视觉特征」。
- 严格避免「明确禁止项」中列出的所有做法。
- 色彩比例允许 ±10% 浮动，但不得引入规范之外的新色相。
- 具体页面结构、文案与功能需求以用户当次任务描述为准，本规范不提供。
- 不要复刻任何具体品牌的 Logo、角色或受保护的独特图形。

## 12. 来源说明与置信度

- 本规范由参考图片分析生成；标注［推断］的规则为 AI 归纳，非图片中直接可见。
- 置信度为「低」的规则建议人工确认后再使用。

## 13. 不确定项

${fmtList(a.uncertainties)}
`;
}
