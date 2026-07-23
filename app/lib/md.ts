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
 * JSON → 后期风格精简参数（类似 Lightroom 预设 / VSCO 滤镜名）
 * 纯后期处理指令，不描述照片内容。用户复制即可用于修图。
 */
export function renderPromptShort(a: StyleAnalysis): string {
  const segments: string[] = [];

  // 风格名
  segments.push(`【${a.name}】`);

  // 调色维度
  const colorParts: string[] = [];
  const fullText = a.summary + (a.keywords ?? []).map((k) => k.meaning + k.word).join("");

  // 色温
  if (/暖/.test(fullText)) colorParts.push("暖调");
  else if (/冷/.test(fullText)) colorParts.push("冷调");

  // 饱和度
  if (/低饱|褪色|降饱|淡雅/.test(fullText)) colorParts.push("低饱和");
  else if (/高饱|鲜艳|浓郁/.test(fullText)) colorParts.push("高饱和");

  // 主要色系（仅取1-2个，用抽象词）
  const paletteHints: string[] = [];
  for (const c of a.colors ?? []) {
    const n = c.name;
    if (/橙|橘/.test(n)) paletteHints.push("偏橙");
    if (/蓝|青/.test(n)) paletteHints.push("偏蓝");
    if (/黄|金/.test(n)) paletteHints.push("偏黄");
    if (/绿/.test(n)) paletteHints.push("偏绿");
    if (/红/.test(n)) paletteHints.push("偏红");
    if (/紫/.test(n)) paletteHints.push("偏紫");
  }
  // 去重取前2个
  const seen = new Set<string>();
  const uniqueHints: string[] = [];
  for (const h of paletteHints) {
    if (!seen.has(h)) { seen.add(h); uniqueHints.push(h); }
  }
  colorParts.push(...uniqueHints.slice(0, 2));

  if (colorParts.length) segments.push(colorParts.join("+"));

  // 光影维度
  const lightParts: string[] = [];
  if (/高对比|强对比|反差/.test(fullText)) lightParts.push("强对比");
  else if (/低对比|柔/.test(fullText)) lightParts.push("柔对比");
  if (/暗角|晕影/.test(fullText)) lightParts.push("暗角");
  if (/褪色|fade|黑色提升/.test(fullText)) lightParts.push("褪色");
  if (/过曝|高光|提亮/.test(fullText)) lightParts.push("高光偏亮");
  if (/欠曝|暗调|低曝/.test(fullText)) lightParts.push("暗调");
  if (lightParts.length) segments.push(lightParts.join("+"));

  // 质感维度
  const textureParts: string[] = [];
  const combined = (a.imagery?.treatment?.value ?? "") + (a.effects?.texture?.value ?? "") + (a.effects?.shadow?.value ?? "");
  if (/颗粒|噪点/.test(combined)) textureParts.push("颗粒");
  if (/胶片/.test(combined)) textureParts.push("胶片感");
  if (/柔焦|模糊/.test(combined)) textureParts.push("柔焦");
  if (/锐/.test(combined)) textureParts.push("锐化");
  if (/纸纹|纸感/.test(combined)) textureParts.push("纸纹");
  if (/磨皮|光滑/.test(combined)) textureParts.push("磨皮");
  if (textureParts.length) segments.push(textureParts.join("+"));

  // 裁切
  const crop = a.imagery?.crop?.value ?? "";
  if (/4:3|4：3/.test(crop)) segments.push("4:3");
  else if (/3:2|3：2/.test(crop)) segments.push("3:2");
  else if (/16:9|16：9/.test(crop)) segments.push("16:9");
  else if (/1:1|1：1/.test(crop)) segments.push("1:1");

  return segments.join(" | ");
}

/**
 * JSON → 照片后期处理完整指南
 * 按后期维度组织：白平衡/色调 → 饱和度 → 对比度/光影 → 质感/纹理 → 裁切
 * 每一行是可执行操作，不描述画面内容（不出现物体/地标/场景名）
 */
export function renderPrompt(a: StyleAnalysis): string {
  const sections: string[] = [];

  // 开场
  sections.push(
    `## ${a.name}\n\n> ${a.summary}\n\n将以下后期参数套用到任意照片即可获得相似风格。**本指南只含后期处理手法，不含画面内容描述。**`
  );

  const fullText = a.summary + (a.keywords ?? []).map((k) => k.meaning + k.word).join("");
  const combined = (a.imagery?.treatment?.value ?? "") + (a.effects?.texture?.value ?? "") + (a.effects?.shadow?.value ?? "");
  const avoidAll = (a.avoid ?? []).join("");

  // 1. 白平衡与色温
  const wbItems: string[] = [];
  if (/暖/.test(fullText)) wbItems.push("- 色温偏暖（+色温），画面整体偏黄/橙");
  else if (/冷/.test(fullText)) wbItems.push("- 色温偏冷（-色温），画面整体偏蓝/青");
  if (/偏青/.test(fullText)) wbItems.push("- 高光偏青，阴影偏暖");
  if (/偏品/.test(fullText)) wbItems.push("- 色调偏品红");
  if (/偏绿/.test(fullText)) wbItems.push("- 色调偏绿");
  if (wbItems.length) sections.push(`### 白平衡与色温\n${wbItems.join("\n")}`);

  // 2. 调色
  const colors = a.colors ?? [];
  if (colors.length > 0) {
    const cItems: string[] = [];
    for (const c of colors) {
      cItems.push(`- ${c.name}（\`${c.hex}\`）— ${c.role === "background" ? "画面大面积底色" : c.role === "primary" ? "主色调" : c.role === "accent" ? "点缀强调" : c.role}，占比${c.proportion}`);
    }
    if (/低饱|褪色|降饱|淡雅/.test(fullText)) cItems.push("- 整体饱和度偏低，色彩收敛");
    else if (/高饱|鲜艳|浓郁/.test(fullText)) cItems.push("- 整体饱和度偏高，色彩鲜明");
    sections.push(`### 调色\n${cItems.join("\n")}`);
  }

  // 3. 对比度与光影
  const lightItems: string[] = [];
  if (/高对比|强对比|反差/.test(combined)) lightItems.push("- 对比度偏高，明暗交界分明");
  else if (/低对比|柔/.test(combined)) lightItems.push("- 对比度偏低，明暗过渡柔和");
  if (/褪色|fade|黑色提升/.test(combined)) lightItems.push("- 黑色端提升（lift blacks），暗部偏灰，褪色感");
  if (/过曝|高光偏亮|高调/.test(combined + fullText)) lightItems.push("- 高光适当过曝，亮部细节可丢失");
  if (/欠曝|暗调|低曝/.test(combined + fullText)) lightItems.push("- 整体偏暗，曝光偏低");
  if (lightItems.length) sections.push(`### 对比度与光影\n${lightItems.join("\n")}`);

  // 4. 质感与纹理
  const texItems: string[] = [];
  if (/颗粒|噪点/.test(combined)) texItems.push("- 叠加细颗粒噪点，模拟胶片质感");
  if (/胶片|胶卷/.test(combined)) texItems.push("- 胶片色调曲线，高光偏暖阴影偏冷");
  if (/暗角|晕影/.test(combined)) texItems.push("- 四角添加暗角（vignette），引导视线");
  if (/柔焦|模糊/.test(combined)) texItems.push("- 柔焦处理，降低画面锐度");
  if (/锐/.test(combined)) texItems.push("- 整体锐化，保持清晰度");
  if (/磨皮/.test(combined)) texItems.push("- 光滑表面柔化（磨皮）");
  if (/纸纹|纸感/.test(combined)) texItems.push("- 叠加轻微纸纹/纹理贴图");
  if (texItems.length) sections.push(`### 质感与纹理\n${texItems.join("\n")}`);

  // 5. 裁切
  const crop = a.imagery?.crop?.value ?? "";
  if (crop) {
    sections.push(`### 裁切\n- 裁切比例：${crop}`);
  }

  // 6. 保留
  if ((a.mustKeep ?? []).length) {
    sections.push(`### 必须保留\n${a.mustKeep.map((s) => `- ${s}`).join("\n")}`);
  }

  // 7. 避免
  if ((a.avoid ?? []).length) {
    sections.push(`### 避免\n${a.avoid.map((s) => `- ${s}`).join("\n")}`);
  }

  return sections.join("\n\n");
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
