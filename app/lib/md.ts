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
 * JSON → 设计风格精简参数（可复制粘贴到 AI 设计工具的快速风格描述）
 * 纯设计语言描述，不绑定具体项目内容。
 */
export function renderPromptShort(a: StyleAnalysis): string {
  const segments: string[] = [];

  // 风格名 + 流派
  segments.push(`【${a.name}】`);
  if (a.designLanguage && a.designLanguage.movement !== "无明显流派") {
    segments.push(`${a.designLanguage.movement}风`);
  }

  // 色彩维度
  const fullText = a.summary + (a.keywords ?? []).map((k) => k.meaning + k.word).join("");
  const colorParts: string[] = [];

  // 色温
  if (/暖/.test(fullText)) colorParts.push("暖调");
  else if (/冷/.test(fullText)) colorParts.push("冷调");

  // 饱和度
  if (/低饱|降饱|褪色|淡雅|收敛/.test(fullText)) colorParts.push("低饱和");
  else if (/高饱|鲜艳|浓郁|高饱和/.test(fullText)) colorParts.push("高饱和");

  if (colorParts.length) segments.push(colorParts.join("+"));

  // 空间维度
  const spaceParts: string[] = [];
  if (/留白|负空间|呼吸/.test(fullText)) spaceParts.push("大留白");
  if (/密集|紧凑/.test(fullText)) spaceParts.push("高密度");
  if (/网格/.test(fullText)) spaceParts.push("网格对齐");
  if (spaceParts.length) segments.push(spaceParts.join("+"));

  // 形态维度
  const formParts: string[] = [];
  if (/直角|锐利|硬边/.test(fullText)) formParts.push("硬边直角");
  if (/圆角/.test(fullText)) formParts.push("圆角");
  if (/有机|曲线/.test(fullText)) formParts.push("有机形");
  if (formParts.length) segments.push(formParts.join("+"));

  // 光影维度
  const effParts: string[] = [];
  if (/扁平|无投影/.test(fullText)) effParts.push("扁平无投影");
  if (/阴影|投影/.test(fullText)) effParts.push("带投影");
  if (/噪点|颗粒/.test(fullText)) effParts.push("噪点肌理");
  if (effParts.length) segments.push(effParts.join("+"));

  return segments.join(" | ");
}

/**
 * JSON → 设计风格可复用提示词
 * 固定 8–9 节，每节格式统一：`- **两字标签**：描述`，节奏稳定，无嵌套子节。
 */
export function renderPrompt(a: StyleAnalysis): string {
  const sections: string[] = [];

  // 开场
  sections.push(`## ${a.name}\n\n> ${a.summary}`);

  const fullText = a.summary + (a.keywords ?? []).map((k) => k.meaning + k.word).join("");

  // 1. 流派
  if (a.designLanguage && a.designLanguage.movement !== "无明显流派") {
    const confLabel = a.designLanguage.confidence === "high" ? "高" : a.designLanguage.confidence === "medium" ? "中" : "低";
    sections.push(
      `### 流派\n- **归属**：${a.designLanguage.movement}（置信度：${confLabel}）\n- **依据**：${a.designLanguage.rationale}`
    );
  }

  // 2. 色彩
  const colorItems: string[] = [];
  if (/暖/.test(fullText)) colorItems.push("- **色温**：暖调，偏琥珀/橙");
  else if (/冷/.test(fullText)) colorItems.push("- **色温**：冷调，偏蓝/青");
  else colorItems.push("- **色温**：中性");

  if (/低饱|降饱|褪色|淡雅|收敛|克制/.test(fullText)) colorItems.push("- **饱和**：低饱和，色彩收敛克制");
  else if (/高饱|鲜艳|浓郁/.test(fullText)) colorItems.push("- **饱和**：高饱和，色彩鲜明有力");
  else colorItems.push("- **饱和**：自然");

  for (const c of a.colors ?? []) {
    const roleDesc = c.role === "background" ? "底" : c.role === "primary" ? "主" : c.role === "accent" ? "强调" : "辅";
    colorItems.push(`- **${c.name}** \`${c.hex}\`（${roleDesc}，${c.proportion}）`);
  }
  sections.push(`### 色彩\n${colorItems.join("\n")}`);

  // 3. 空间
  const spaceItems: string[] = [];
  const densityVal = a.layout?.density?.value ?? "";
  const whitespaceVal = a.layout?.whitespace?.value ?? "";
  const focusVal = a.layout?.visualFocus?.value ?? "";
  const gridVal = a.layout?.grid?.value ?? "";

  const densityText = densityVal || whitespaceVal;
  if (/稀疏|低密|呼吸|留白|宽松/.test(densityText)) spaceItems.push("- **密度**：低密度，元素间呼吸感强");
  else if (/密集|紧凑|高密/.test(densityText)) spaceItems.push("- **密度**：高密度，信息紧凑高效");
  else if (densityText) spaceItems.push(`- **密度**：${densityText}`);
  else spaceItems.push("- **密度**：适中");

  if (/留白|负空间|50%/.test(whitespaceVal)) spaceItems.push("- **留白**：负空间占比高，留白是主动设计元素");
  else if (whitespaceVal) spaceItems.push(`- **留白**：${whitespaceVal}`);
  else spaceItems.push("- **留白**：常规");

  if (/对角|左上|偏移|非对称/.test(focusVal)) spaceItems.push("- **重心**：非对称，视觉流偏移中心");
  else if (focusVal) spaceItems.push(`- **重心**：${focusVal}`);
  else spaceItems.push("- **重心**：居中式");

  if (/网格|模块|列|grid|对齐/.test(gridVal)) spaceItems.push("- **网格**：严格模块化对齐");
  else if (gridVal) spaceItems.push(`- **网格**：${gridVal}`);
  else spaceItems.push("- **网格**：自由布局");

  sections.push(`### 空间\n${spaceItems.join("\n")}`);

  // 4. 造型
  const formItems: string[] = [];
  const cornersVal = a.shapes?.corners?.value ?? "";
  const bordersVal = a.shapes?.borders?.value ?? "";
  const shapeFormVal = a.shapes?.form?.value ?? "";

  if (/直角|无圆角|0/.test(cornersVal)) formItems.push("- **圆角**：纯直角，锐利硬朗");
  else if (/微.*圆角|小.*圆角|2.?4/.test(cornersVal)) formItems.push("- **圆角**：微圆角（2-4px）");
  else if (/大.*圆角|圆润/.test(cornersVal)) formItems.push("- **圆角**：大圆角，亲和柔软");
  else if (cornersVal) formItems.push(`- **圆角**：${cornersVal}`);
  else formItems.push("- **圆角**：常规");

  if (/细.*线|1px|无.*边框|留白.*分/.test(bordersVal)) formItems.push("- **分割**：细线或无边框，靠留白和色块区分区域");
  else if (bordersVal) formItems.push(`- **分割**：${bordersVal}`);
  else formItems.push("- **分割**：常规边框");

  if (/几何|矩形|硬边|直线|构成/.test(shapeFormVal)) formItems.push("- **形态**：纯几何，矩形与直线为主");
  else if (/有机|曲线|流体|自然/.test(shapeFormVal)) formItems.push("- **形态**：有机曲线，柔和流动");
  else if (shapeFormVal) formItems.push(`- **形态**：${shapeFormVal}`);
  else formItems.push("- **形态**：混合");

  sections.push(`### 造型\n${formItems.join("\n")}`);

  // 5. 材质
  const matItems: string[] = [];
  const shadowVal = a.effects?.shadow?.value ?? "";
  const textureVal = a.effects?.texture?.value ?? "";

  if (/无.*投影|扁平/.test(shadowVal)) matItems.push("- **阴影**：完全无投影，纯扁平");
  else if (/柔和|弥散/.test(shadowVal)) matItems.push("- **阴影**：柔和弥散，轻微浮起感");
  else if (/硬|锐|多层/.test(shadowVal)) matItems.push("- **阴影**：锐利硬投影，强化纵深");
  else if (shadowVal) matItems.push(`- **阴影**：${shadowVal}`);
  else matItems.push("- **阴影**：无");

  if (/光滑|无.*纹理|平面/.test(textureVal)) matItems.push("- **质感**：光滑平面，无纹理");
  else if (/颗粒|噪点|胶片/.test(textureVal)) matItems.push("- **质感**：轻微颗粒/噪点，胶片触感");
  else if (/纸纹|纸感/.test(textureVal)) matItems.push("- **质感**：纸纹肌理");
  else if (/毛玻璃|磨砂|玻璃/.test(textureVal)) matItems.push("- **质感**：磨砂/毛玻璃");
  else if (textureVal) matItems.push(`- **质感**：${textureVal}`);
  else matItems.push("- **质感**：无特殊纹理");

  sections.push(`### 材质\n${matItems.join("\n")}`);

  // 6. 图像
  const imgItems: string[] = [];
  const imgTypeVal = a.imagery?.type?.value ?? "";
  const cropVal = a.imagery?.crop?.value ?? "";
  const treatmentVal = a.imagery?.treatment?.value ?? "";

  if (imgTypeVal) imgItems.push(`- **类型**：${imgTypeVal}`);
  if (cropVal) imgItems.push(`- **裁切**：${cropVal}`);
  if (treatmentVal) imgItems.push(`- **处理**：${treatmentVal}`);

  if (imgItems.length) sections.push(`### 图像\n${imgItems.join("\n")}`);

  // 7. 组件（可选）
  const comps = a.components ?? [];
  const validComps = comps.filter((c) => c.value && !/无明显/.test(c.value));
  if (validComps.length) {
    sections.push(`### 组件\n${validComps.map((c) => `- ${c.value}`).join("\n")}`);
  }

  // 8. 约束
  const constraintItems: string[] = [];
  if ((a.mustKeep ?? []).length) constraintItems.push(...a.mustKeep.map((s) => `- **保留**：${s}`));
  if ((a.avoid ?? []).length) constraintItems.push(...a.avoid.map((s) => `- **禁止**：${s}`));
  if (constraintItems.length) sections.push(`### 约束\n${constraintItems.join("\n")}`);

  // 9. 备注（不确定项 + 免责）
  const notes: string[] = [];
  if ((a.uncertainties ?? []).length) notes.push(...a.uncertainties.map((s) => `- ${s}`));
  notes.push("- 以上为可迁移的视觉语言规范，可套用到任意设计项目");
  notes.push("- 色彩比例允许 ±10% 浮动，不得引入新色相");
  notes.push("- 不包含原图具体内容、品牌标识或受保护图形");
  sections.push(`### 备注\n${notes.join("\n")}`);

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

## 2. 设计流派归属

${a.designLanguage && a.designLanguage.movement !== "无明显流派"
    ? `- **${a.designLanguage.movement}**（置信度：${CONF_LABEL[a.designLanguage.confidence] ?? a.designLanguage.confidence}）\n- ${a.designLanguage.rationale}`
    : "- 未检测到明显已知设计流派特征"}

## 3. 整体气质与视觉原则

${a.summary}

本规范只定义视觉语言，不绑定任何具体项目类型（App / 网页 / 海报均可适用）。具体项目的内容、布局与功能需在使用本规范时另行提供。

## 4. 色彩系统与使用比例

| 角色 | 名称 | 色值 | 占比 | 置信度 | 证据 |
| --- | --- | --- | --- | --- | --- |
${colorLines}

## 5. 构图、网格、间距与留白

- **信息密度**：${fmtRule(a.layout?.density)}
- **留白**：${fmtRule(a.layout?.whitespace)}
- **视觉重心**：${fmtRule(a.layout?.visualFocus)}
- **网格与对称**：${fmtRule(a.layout?.grid)}

## 6. 形状、轮廓、边框与圆角

- **圆角**：${fmtRule(a.shapes?.corners)}
- **边框与线条**：${fmtRule(a.shapes?.borders)}
- **形态语言**：${fmtRule(a.shapes?.form)}

## 7. 图像、摄影或插画语言

- **图像类型**：${fmtRule(a.imagery?.type)}
- **裁切方式**：${fmtRule(a.imagery?.crop)}
- **处理方式**：${fmtRule(a.imagery?.treatment)}

## 8. 材质、纹理和装饰规则

- **阴影**：${fmtRule(a.effects?.shadow)}
- **纹理与材质**：${fmtRule(a.effects?.texture)}

## 9. 组件与版式母题

${(a.components ?? []).length > 0 ? a.components.map((c) => `- ${fmtRule(c)}`).join("\n") : "- （无明显重复组件）"}

## 10. 必须保持的视觉特征

${fmtList(a.mustKeep)}

## 11. 明确禁止项

${fmtList(a.avoid)}

## 12. 提供给 AI 的通用执行规则

- 以上所有规则适用于任何设计载体；执行时优先保证「必须保持的视觉特征」。
- 严格避免「明确禁止项」中列出的所有做法。
- 色彩比例允许 ±10% 浮动，但不得引入规范之外的新色相。
- 具体页面结构、文案与功能需求以用户当次任务描述为准，本规范不提供。
- 不要复刻任何具体品牌的 Logo、角色或受保护的独特图形。

## 13. 来源说明与置信度

- 本规范由参考图片分析生成；标注［推断］的规则为 AI 归纳，非图片中直接可见。
- 置信度为「低」的规则建议人工确认后再使用。

## 14. 不确定项

${fmtList(a.uncertainties)}
`;
}
