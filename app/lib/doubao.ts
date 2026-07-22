/**
 * 豆包视觉分析（火山引擎方舟 Ark，OpenAI 兼容接口）
 *
 * 环境变量（.env.local）：
 *   ARK_API_KEY   火山方舟 API Key
 *   ARK_MODEL     模型或接入点 ID，如 doubao-seed-2-0-lite-260428 / ep-xxxxxx
 *
 * 未配置或调用失败时抛错，由调用方决定回退到 demo 数据。
 */
import type { StyleAnalysis } from "./schema";
import { ANALYSIS_JSON_TEMPLATE } from "./schema";

const ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_TIMEOUT_MS = 85_000;
const MAX_ATTEMPTS = 2;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

const SYSTEM_PROMPT = `你是一名专业的视觉设计语言分析师。用户会给你一张或多张设计参考图片（按顺序编号为图片 1、图片 2……）。

你的任务：把图片中的视觉风格拆解为结构化、可执行的设计规则，并严格以 JSON 输出。

【硬性要求】
1. 只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块标记。
2. 每条规则必须基于图片证据：evidenceImages 填写该判断来自哪几张图片的编号。
3. 区分 sourceType：图片中可直接看到的填 "direct"，跨图片归纳或推断的填 "inferred"。没有证据支撑的判断宁可写入 uncertainties，不要编造。
4. 完全排除 typography：不要分析或输出字体、字重、字号、行距、字距、字体名称或文字层级。
5. 禁止从静态图片虚构动效、转场或交互规则。
6. 关键词必须是具体的视觉描述，禁止只给"高级、简约、大气"这类空泛形容词而不解释其在画面中的具体表现。
7. 颜色给出 hex 估计值与大致占比；尺寸不确定时给出比例关系而非绝对数值。
8. avoid（禁止项）必须具体：列出会破坏该风格的颜色、形状、阴影、材质和布局方式，但不要讨论字体。
9. 多张图片时优先归纳共同特征；若图片之间风格明显冲突，在 uncertainties 中说明。
10. keywords 3–5 个，colors 4–6 个，components 列出反复出现的卡片、标签、分割线等视觉母题。

【输出 JSON 结构】（严格遵循，不得增减字段）
${ANALYSIS_JSON_TEMPLATE}`;

interface ChatMessage {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
}

/**
 * 分析一组图片，返回结构化风格 JSON。
 * @param images base64 图片数组（按编号顺序）
 * @param primaryIndexes 重点参考图的编号（从 1 开始）
 */
export async function analyzeImages(
  images: { base64: string; mime: string }[],
  primaryIndexes: number[] = []
): Promise<StyleAnalysis> {
  if (!images || images.length === 0) {
    throw new Error("至少需要一张图片");
  }

  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_MODEL;
  if (!apiKey || !model) {
    throw new Error("未配置 ARK_API_KEY 或 ARK_MODEL");
  }

  const hint =
    primaryIndexes.length > 0
      ? `共 ${images.length} 张图片，其中图片 ${primaryIndexes.join(
          "、"
        )} 是用户指定的重点参考，分析时以它们为主。`
      : `共 ${images.length} 张图片。`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: `${hint}\n请分析以下参考图片的视觉风格。` },
        ...images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: `data:${img.mime};base64,${img.base64}` },
        })),
      ],
    },
  ];

  const configuredTimeout = Number(process.env.ARK_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.min(100_000, Math.max(15_000, configuredTimeout))
    : DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${ARK_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 3500,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        const error = new Error(`Ark API 错误 ${res.status}: ${body.slice(0, 300)}`);
        if (!RETRYABLE_STATUS.has(res.status) || attempt === MAX_ATTEMPTS) throw error;
        lastError = error;
      } else {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        const text = Array.isArray(content)
          ? content.map((part: { text?: string }) => part.text ?? "").join("")
          : String(content ?? "");
        return parseAnalysisJson(text);
      }
    } catch (error) {
      const normalized =
        error instanceof Error && error.name === "AbortError"
          ? new Error(`Ark 请求超过 ${Math.round(timeoutMs / 1000)} 秒`)
          : error;
      lastError = normalized;
      const message = normalized instanceof Error ? normalized.message : String(normalized);
      const nonRetryable = /Ark API 错误 (400|401|403|404|422):/.test(message);
      if (nonRetryable || attempt === MAX_ATTEMPTS) throw normalized;
    } finally {
      clearTimeout(timer);
    }

    await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("Ark 视觉分析失败");
}

/** 容错解析：剥掉可能的 markdown 代码块，截取第一个 { 到最后一个 } */
export function parseAnalysisJson(text: string): StyleAnalysis {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI 返回中未找到 JSON");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  // 兼容旧模型或旧提示词的响应，但从产品数据中永久移除 Typography。
  delete parsed.typography;
  const required = [
    "name",
    "summary",
    "keywords",
    "colors",
    "layout",
    "shapes",
    "imagery",
    "effects",
    "components",
    "mustKeep",
    "avoid",
    "uncertainties",
  ];
  const missing = required.filter((key) => parsed[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`AI JSON 缺少字段：${missing.join("、")}`);
  }
  if (!Array.isArray(parsed.colors) || parsed.colors.length < 4) {
    throw new Error("AI JSON 的 colors 至少需要 4 项");
  }
  return parsed as unknown as StyleAnalysis;
}
