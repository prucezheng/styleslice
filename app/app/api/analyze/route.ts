/**
 * POST /api/analyze
 * 入参：{ imageIds: string[], primaryImageIds?: string[], demo?: boolean }
 * 返回：StyleAnalysis + markdown + fallback 标记
 *
 * 兜底策略：只有 demo=true 或 DEMO_MODE=1 时返回演示数据。
 * 正常用户分析必须来自 Ark 视觉模型；配置缺失或 AI 调用失败时返回错误，
 * 避免把固定 demo 结果误保存为真实分析。
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeImages } from "@/lib/doubao";
import { renderMarkdown } from "@/lib/md";
import { readUpload, isValidId } from "@/lib/store";
import { DEMO_ANALYSIS } from "@/lib/demo";
import type { StyleAnalysis } from "@/lib/schema";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    return NextResponse.json({ error: "缺少 imageIds" }, { status: 400 });
  }
  const imageIds: string[] = body.imageIds.slice(0, 10);
  const primaryImageIds: string[] = body.primaryImageIds ?? [];

  let analysis: StyleAnalysis;
  let fallback = false;
  let fallbackReason: string | null = null;

  if (body.demo === true) {
    analysis = DEMO_ANALYSIS;
    fallback = true;
    fallbackReason = "demo";
  } else if (process.env.DEMO_MODE === "1") {
    analysis = DEMO_ANALYSIS;
    fallback = true;
    fallbackReason = "demo_mode";
  } else {
    // 非显式 demo 时，先校验图片资源：ID 非法或文件不存在属于输入错误，
    // 返回 400/404，绝不静默回退演示数据（避免用户保存假结果）
    const images = [];
    for (const id of imageIds) {
      if (!isValidId(id)) {
        return NextResponse.json({ error: `非法的图片 ID：${id}` }, { status: 400 });
      }
      const file = await readUpload(id);
      if (!file) {
        return NextResponse.json(
          { error: `图片不存在或已删除：${id}` },
          { status: 404 }
        );
      }
      images.push({ base64: file.buffer.toString("base64"), mime: file.mime });
    }
    const primaryIndexes = primaryImageIds
      .map((pid) => imageIds.indexOf(pid) + 1)
      .filter((i) => i > 0);
    if (!process.env.ARK_API_KEY || !process.env.ARK_MODEL) {
      return NextResponse.json(
        { error: "未配置 ARK_API_KEY 或 ARK_MODEL，无法进行真实图片分析" },
        { status: 503 }
      );
    }
    try {
      analysis = await analyzeImages(images, primaryIndexes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[analyze] AI 调用失败：", message);
      return NextResponse.json(
        { error: "AI 视觉分析失败", detail: message.slice(0, 500) },
        { status: 502 }
      );
    }
  }

  const result: Record<string, unknown> = {
    ...analysis,
    markdown: renderMarkdown(analysis),
    source: { imageIds, primaryImageIds },
    fallback,
  };
  if (fallbackReason) result.fallbackReason = fallbackReason;
  return NextResponse.json(result);
}
