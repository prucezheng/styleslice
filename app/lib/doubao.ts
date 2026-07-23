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

const SYSTEM_PROMPT = `你是一名专业的照片后期处理风格分析师。用户会给你一张照片，你需要分析这张照片的**后期处理手法**（调色、光影、质感、滤镜），而非分析照片中拍了什么。

你的任务：把照片的后期处理风格拆解为结构化数据，严格以 JSON 输出。

【核心原则：只分析后期处理手法，不分析画面内容】

✅ 分析范围：
- 色调（暖/冷/中性）、白平衡倾向
- 饱和度（高/低/褪色程度）
- 对比度（强/弱）、高光与阴影关系
- 颗粒/噪点/胶片感
- 暗角/晕影
- 柔焦/锐度/清晰度
- 曝光倾向（过曝/欠曝/正常）
- 纹理质感（纸纹/磨砂/光滑/毛玻璃等）
- 裁切比例与构图倾向
- 滤镜色彩偏移（偏青/偏黄/偏品红等）

❌ 严禁描述：
- 画面中的具体物体、人物、动物、建筑、地标（如"埃菲尔铁塔""红色电话亭""大本钟""樱花""猫"等）
- 场景或地点（如"海边""咖啡馆""街道""森林"等）
- 画面中的文字内容或品牌标识
- 拍摄对象是什么

【硬性要求】
1. 只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块标记。
2. 每条规则必须基于图片证据：evidenceImages 填写该判断来自哪几张图片的编号。
3. 区分 sourceType：图片中可直接看到的填 "direct"，跨图片归纳或推断的填 "inferred"。没有证据支撑的判断宁可写入 uncertainties。
4. 完全排除 typography：不分析字体、字重、字号、行距、字距。
5. name 用后期风格命名（如"暖调胶片风""褪色暗调风""高饱和街拍风"），不得含任何物体/地点名。
6. summary 只描述后期处理效果（如"暖调+低饱和+细颗粒的胶片风格"），不描述画面内容。
7. keywords 3–5 个，只描述后期处理特征（如"暖调""低饱和""颗粒感""暗角""褪色""高对比""偏青"）。
8. colors 4–6 个，颜色名用抽象描述（如"暖米白""灰蓝""暗橙""墨绿"），严禁用物体命名颜色（禁止"电话亭红""草地绿""天空蓝""樱花粉"等）。
9. colors 的 hex 给估计值，role 为 primary/secondary/background/accent，proportion 写占比。
10. avoid 列出会破坏该后期风格的调色/光影/质感操作（如"避免高饱和""禁止纯黑"）。
11. layout/shapes/components 等字段如与后期处理无关可填通用值，但不能为空。
12. imagery.type 描述摄影类型（纪实/棚拍/街拍/微距等），不描述拍的具体内容。
13. imagery.treatment 描述后期处理（如"降饱和+暖色偏移+轻微颗粒"）。
14. effects.texture 描述纹理质感（如"细颗粒噪点""轻微纸纹""光滑无纹理"）。
15. effects.shadow 描述阴影特征（如"画面扁平无阴影""保留自然阴影"）。

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
 * 分析图片，返回结构化后期风格 JSON。
 * @param images base64 图片数组
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
        { type: "text", text: `${hint}\n请分析以下照片的后期处理风格（调色、光影、质感、滤镜），不要描述画面中拍了什么物体或场景。` },
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
  // 兼容旧数据：永久移除 Typography
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
