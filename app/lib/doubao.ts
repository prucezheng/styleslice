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

const SYSTEM_PROMPT = `你是一名专业的视觉设计风格分析师。用户会给你一张参考图（可能是摄影作品、海报、UI 界面、平面设计等），你需要从**设计语言**的角度进行分析，提取可迁移复用的视觉规范。

你的任务：把参考图的视觉风格拆解为结构化数据，严格以 JSON 输出。

【核心原则：提取设计语言，不复制原图内容】

✅ 分析范围：
- 设计流派识别：判断参考图是否属于以下已知设计运动/风格之一，或受其影响
  （包豪斯 Bauhaus / 瑞士国际主义 Swiss Style / 孟菲斯 Memphis / 粗野主义 Brutalism /
   极简主义 Minimalism / 装饰艺术 Art Deco / 蒸汽波 Vaporwave / 赛博朋克 Cyberpunk /
   北欧 Scandinavian / 日式侘寂 Wabi-sabi / 风格派 De Stijl / 波普艺术 Pop Art /
   新拟态 Neumorphism / 玻璃态 Glassmorphism / 酸性设计 Acid Design /
   复古未来主义 Retro-futurism / 极繁主义 Maximalism / 新丑风 Anti-design / 像素风 Pixel Art）
- 色彩策略：色温倾向、饱和度策略、色板关系、主要色系及其角色
- 空间语言：密度感、留白策略、视觉重心、网格系统
- 形态语言：几何倾向、圆角策略、分割方式、造型特征
- 材质与光影：表面质感、阴影语言、纹理处理
- 图像处理：图像类型方向、裁切哲学、后期基调
- 组件母题：反复出现的版式/视觉模式

❌ 严禁描述：
- 画面中的具体物体、人物、动物、建筑、地标（如"埃菲尔铁塔""红色电话亭""樱花""猫"等）
- 场景或地点（如"海边""咖啡馆""街道""森林"等）
- 画面中的文字内容或品牌标识
- 拍摄对象是什么
- 具体字体名称（但可以描述字体的风格倾向，如"无衬线几何感""人文主义衬线"）

【硬性要求】
1. 只输出 JSON，不要输出任何其他文字、解释或 markdown 代码块标记。
2. 每条规则必须基于图片证据：evidenceImages 填写该判断来自哪几张图片的编号。
3. 区分 sourceType：图片中可直接看到的填 "direct"，跨图片归纳或推断的填 "inferred"。没有证据支撑的判断宁可写入 uncertainties。
4. 完全排除 typography 的具体分析：不分析字体、字重、字号、行距、字距的具体数值。
5. name 用设计风格命名（如"包豪斯几何风""孟菲斯撞色风""瑞士理性排版风""日式留白风"），不得含任何物体/地点名。
6. summary 一句话概括该设计的视觉语言特征（如"高饱和原色碰撞 + 几何硬边 + 大面积留白的孟菲斯风格"）。
7. keywords 3–5 个，使用设计专业术语（如"网格系统""原色碰撞""硬边几何""呼吸感留白""波普感"）。
8. colors 4–6 个，颜色名用抽象描述（如"暖米白""灰蓝""暗橙""墨绿"），严禁用物体命名颜色（禁止"电话亭红""草地绿""天空蓝""樱花粉"等）。
9. colors 的 hex 给估计值，role 为 primary/secondary/background/accent，proportion 写占比。
10. designLanguage：识别参考图是否属于已知设计流派。如果明显匹配某个流派，填写 movement（如"孟菲斯"）、confidence 和 rationale（如"高饱和原色+几何硬边+黑色描边是孟菲斯典型特征"）。如果无明显流派归属，movement 填"无明显流派"，confidence 填"low"，rationale 填"未观察到已知设计流派的典型特征"。
11. avoid 列出会破坏该视觉风格的做法（如"避免柔和渐变""禁止有机曲线"）。
12. layout/shapes/components 等字段如与设计风格无关可填通用值，但不能为空。
13. imagery.type 描述图像类型（摄影/插画/3D/图形/混合），不描述拍的具体内容。
14. imagery.treatment 描述图像处理基调（如"高对比黑白""褪色胶片感""柔焦暖调"）。
15. effects.texture 描述材质质感（如"细颗粒噪点""轻微纸纹""光滑无纹理""磨砂玻璃"）。
16. effects.shadow 描述阴影特征（如"无投影扁平化""弥散柔和阴影""锐利硬投影"）。

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
        { type: "text", text: `${hint}\n请分析这张参考图的视觉设计语言（色彩策略、空间语言、形态语言、材质光影、设计流派归属），不要描述画面中拍了什么物体或场景。如果参考图有明显的设计流派特征（如包豪斯、孟菲斯、瑞士风格等），请在 designLanguage 中明确指出。` },
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
    "designLanguage",
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
