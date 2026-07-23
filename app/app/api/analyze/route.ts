/**
 * POST /api/analyze
 * 入参：{ imageIds: string[], primaryImageIds?: string[], demo?: boolean }
 * 返回：StyleAnalysis + markdown + prompt + fallback 标记
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeImages } from "@/lib/doubao";
import { renderMarkdown, renderPrompt, renderPromptShort } from "@/lib/md";
import { readUpload, readUploadLocal, isValidId } from "@/lib/store";
import { getRequestAuth, isSupabaseConfigured } from "@/lib/auth-server";
import { DEMO_ANALYSIS } from "@/lib/demo";
import type { StyleAnalysis } from "@/lib/schema";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    return NextResponse.json({ error: "缺少 imageIds" }, { status: 400 });
  }
  if (body.imageIds.length > 1) {
    return NextResponse.json({ error: "当前仅支持单张图片分析" }, { status: 400 });
  }
  const imageIds: string[] = body.imageIds.slice(0, 1);
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
    const images = [];
    for (const id of imageIds) {
      if (!isValidId(id)) {
        return NextResponse.json({ error: `非法的图片 ID：${id}` }, { status: 400 });
      }
      const file = isSupabaseConfigured()
        ? await readUpload(supabase, userId, id)
        : await readUploadLocal(userId, id);
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
        {
          error: "AI 视觉分析失败",
          detail: message.slice(0, 500),
          retryable: !/Ark API 错误 (400|401|403|404|422):/.test(message),
        },
        { status: 502 }
      );
    }
  }

  const result: Record<string, unknown> = {
    ...analysis,
    markdown: renderMarkdown(analysis),
    prompt: renderPrompt(analysis),
    promptShort: renderPromptShort(analysis),
    source: { imageIds, primaryImageIds },
    fallback,
  };
  if (fallbackReason) result.fallbackReason = fallbackReason;
  return NextResponse.json(result);
}
