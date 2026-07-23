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
 * JSON → 照片风格迁移精简提示词
 * 描述参考图的后期处理/滤镜/调色手法，用户可复制到修图工具中对其他照片套用相同风格。
 * 不描述照片内容（拍的是什么），只描述视觉风格（怎么P的）。
 */
export function renderPromptShort(a: StyleAnalysis): string {
  const parts: string[] = [];

  // 开场：风格名 + 一句话定义
  parts.push(`【${a.name}】${a.summary}`);

  // 调色（色彩倾向）
  const colorTerms: string[] = [];
  for (const c of a.colors ?? []) {
    if (c.role === "background" && /白|米|奶|灰|浅/.test(c.name)) colorTerms.push(`底色${c.name}`);
    if (c.role === "accent") colorTerms.push(`强调${c.name}`);
  }
  const paletteNames = (a.colors ?? []).map((c) => c.name).join("+");
  if (paletteNames && !colorTerms.length) {
    colorTerms.push(`色调${paletteNames}`);
  }

  // 饱和度
  const summary = a.summary + (a.keywords ?? []).map((k) => k.meaning).join("");
  if (/低饱和|降饱|褪色|素|淡雅|灰调/.test(summary)) colorTerms.push("低饱和");
  if (/高饱和|鲜艳|浓郁|浓烈/.test(summary)) colorTerms.push("高饱和");
  if (/暖|黄|橙|红|棕/.test(paletteNames + summary)) colorTerms.push("暖调");
  if (/冷|蓝|青|绿|紫/.test(paletteNames + summary)) colorTerms.push("冷调");

  if (colorTerms.length) parts.push(colorTerms.join("+"));

  // 后期效果
  const effectTerms: string[] = [];
  const treatment = a.imagery?.treatment?.value ?? "";
  const texture = a.effects?.texture?.value ?? "";
  const shadow = a.effects?.shadow?.value ?? "";
  const combined = treatment + texture + shadow;

  if (/颗粒|噪点/.test(combined)) effectTerms.push("加颗粒");
  if (/胶片|胶卷|底片/.test(combined)) effectTerms.push("胶片感");
  if (/柔光|柔和/.test(combined)) effectTerms.push("柔光");
  if (/褪色|褪|老旧/.test(combined)) effectTerms.push("褪色处理");
  if (/高对比|反差/.test(combined)) effectTerms.push("强对比");
  if (/低对比/.test(combined)) effectTerms.push("低对比");
  if (/暗角|晕影|vignette/i.test(combined)) effectTerms.push("暗角");
  if (/模糊|柔焦/.test(combined)) effectTerms.push("柔焦");
  if (/锐|清晰|锐化/.test(combined)) effectTerms.push("锐化");
  if (/磨皮|光滑/.test(combined)) effectTerms.push("磨皮");
  if (texture && effectTerms.length < 3 && !/无/.test(texture)) {
    const t = texture.replace(/方面|画面|处理|方式/g, "").trim();
    if (t.length < 10 && !effectTerms.some((e) => t.includes(e.replace("加", "")))) {
      effectTerms.push(t);
    }
  }

  if (effectTerms.length) parts.push(effectTerms.join("+"));

  // 裁切/构图
  const cropTerms: string[] = [];
  const crop = a.imagery?.crop?.value ?? "";
  if (/4:3|4：3/.test(crop)) cropTerms.push("4:3裁切");
  else if (/3:2|3：2/.test(crop)) cropTerms.push("3:2裁切");
  else if (/16:9|16：9/.test(crop)) cropTerms.push("16:9裁切");
  else if (/1:1|1：1|正方/.test(crop)) cropTerms.push("1:1裁切");
  if (/居中/.test(crop)) cropTerms.push("主体居中");
  if (/偏上/.test(crop)) cropTerms.push("主体偏上");
  if (cropTerms.length) parts.push(cropTerms.join("+"));

  // 亮度/曝光
  const lightTerms: string[] = [];
  if (/过曝|亮|白|高调/.test(combined + summary)) lightTerms.push("偏高曝光");
  if (/暗|低曝|低调/.test(combined + summary)) lightTerms.push("偏低曝光");
  if (lightTerms.length) parts.push(lightTerms.join("+"));

  // 去重&拼接
  let result = parts.join(" | ");
  if (result.length > 160) {
    result = result.slice(0, 157).replace(/ | [^|]*$/, "") + "…";
  }
  return result;
}

/**
 * JSON → 照片后期处理完整指南
 * 分为调色、光影、质感、裁切四个维度，每一行都是可执行的操作指令。
 * 目标是：用户把这份指南 + 任意照片给 AI 修图工具，都能得到相似风格的成片。
 */
export function renderPrompt(a: StyleAnalysis): string {
  const parts: string[] = [];

  // 开场
  parts.push(
    `## ${a.name} — 照片后期风格指南\n\n> ${a.summary}\n\n将以下风格参数套用到你的照片上即可获得相似效果。本指南描述的是**后期处理手法**，不涉及原片内容。`
  );

  // 1. 调色
  const colors = a.colors ?? [];
  if (colors.length > 0) {
    parts.push(`### 调色`);
    const colorInstructions: string[] = [];
    for (const c of colors) {
      if (c.role === "background") colorInstructions.push(`- 底色倾向：${c.name}（${c.hex}），画面中占比${c.proportion}`);
      else if (c.role === "primary") colorInstructions.push(`- 主色调：${c.name}（${c.hex}），决定画面整体色温走向`);
      else if (c.role === "accent") colorInstructions.push(`- 强调色：${c.name}（${c.hex}），仅用于点缀，占比${c.proportion}`);
      else colorInstructions.push(`- ${c.name}（${c.hex}），占比${c.proportion}`);
    }
    // 从 summary/keywords 推断饱和度方向
    const fullText = a.summary + (a.keywords ?? []).map((k) => k.meaning).join("") + (a.mustKeep ?? []).join("");
    if (/低饱和|降饱|褪色|淡雅|素|柔和/.test(fullText)) {
      colorInstructions.push("- 饱和度：整体偏低，颜色温和不刺眼");
    } else if (/高饱和|鲜艳|浓郁|浓烈|明亮/.test(fullText)) {
      colorInstructions.push("- 饱和度：偏高，色彩鲜明有冲击力");
    }
    parts.push(colorInstructions.join("\n"));
  }

  // 2. 光影与对比度
  const treatment = a.imagery?.treatment?.value ?? "";
  const texture = a.effects?.texture?.value ?? "";
  const shadow = a.effects?.shadow?.value ?? "";
  const combined = treatment + texture + shadow + (a.imagery?.type?.value ?? "");
  const avoidAll = (a.avoid ?? []).join("");

  const lightInstructions: string[] = [];

  if (/高对比|反差|强对比|高反差/.test(combined)) lightInstructions.push("- 对比度：偏高，亮部与暗部分明");
  else if (/低对比|柔和|柔/.test(combined)) lightInstructions.push("- 对比度：偏低，画面柔和过渡");
  if (/过曝|高光|亮|白色|白/.test(combined + avoidAll)) {
    lightInstructions.push("- 高光：适当提亮，白色区域可轻微过曝");
  }
  if (/暗|阴影|深|黑/.test(combined)) {
    lightInstructions.push("- 阴影：保留暗部细节，不压死黑");
  }
  if (/褪色|fade/.test(combined)) {
    lightInstructions.push("- 黑色提升（lift blacks）：暗部发灰/发白，营造褪色感");
  }
  if (!/投影|阴影/.test(shadow) && /扁平|无投影/.test(shadow + avoidAll)) {
    lightInstructions.push("- 画面扁平化，无纵深感阴影");
  }
  if (lightInstructions.length > 0) {
    parts.push(`### 光影与对比度\n${lightInstructions.join("\n")}`);
  }

  // 3. 质感与纹理
  const textureInstructions: string[] = [];
  if (/颗粒|噪点/.test(combined)) textureInstructions.push("- 叠加细颗粒噪点（模拟胶片颗粒感）");
  if (/胶片|胶卷|底片|film/.test(combined)) textureInstructions.push("- 胶片色调曲线：高光偏暖、阴影偏冷");
  if (/磨皮|光滑|柔肤/.test(combined)) textureInstructions.push("- 皮肤/光滑表面做柔化处理");
  if (/锐|清晰|sharp/.test(combined)) textureInstructions.push("- 整体锐化，保持画面清晰度");
  if (/模糊|柔焦|虚化/.test(combined)) textureInstructions.push("- 柔焦或轻微模糊，降低画面锐度");
  if (/暗角|晕影|vignette/i.test(combined)) textureInstructions.push("- 画面四角加暗角，将视线引向中心");
  if (/玻璃|毛玻璃/.test(combined)) textureInstructions.push("- 叠玻璃态模糊层");
  if (/纸|纸质|纸感/.test(combined)) textureInstructions.push("- 叠加轻微纸纹贴图");
  if (textureInstructions.length > 0) {
    parts.push(`### 质感与纹理\n${textureInstructions.join("\n")}`);
  }

  // 4. 裁切与构图
  const cropInstructions: string[] = [];
  const crop = a.imagery?.crop?.value ?? "";
  if (crop) {
    cropInstructions.push(`- 裁切比例：${crop}`);
  }
  if (/居中/.test(crop)) cropInstructions.push("- 构图：主体居中放置");
  if (/偏上/.test(crop)) cropInstructions.push("- 构图：主体偏上，上方留余量少");
  if (/偏左/.test(crop)) cropInstructions.push("- 构图：主体偏左");
  if (cropInstructions.length > 0) {
    parts.push(`### 裁切与构图\n${cropInstructions.join("\n")}`);
  }

  // 5. 必须保留
  if ((a.mustKeep ?? []).length) {
    parts.push(`### 必须保留\n${a.mustKeep.map((s) => `- ${s}`).join("\n")}`);
  }

  // 6. 禁止
  if ((a.avoid ?? []).length) {
    parts.push(`### 避免\n${a.avoid.map((s) => `- ${s}`).join("\n")}`);
  }

  return parts.join("\n\n");
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
