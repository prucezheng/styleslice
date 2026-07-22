/**
 * JSON → 通用视觉语言规范 Markdown 渲染器
 * 固定 14 节结构（PRD 7.4），由代码渲染保证结构稳定，不让 AI 自由写 MD。
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

## 4. 字体气质、字重关系与排版层级

- **字体类别**：${fmtRule(a.typography?.category)}
- **字重关系**：${fmtRule(a.typography?.weightRelation)}
- **字号层级**：${fmtRule(a.typography?.hierarchy)}
- **行距与字距**：${fmtRule(a.typography?.spacing)}
- **对齐方式**：${fmtRule(a.typography?.alignment)}

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
