/**
 * POST /api/analyze
 * 入参：{ imageIds: string[], primaryImageIds?: string[], demo?: boolean }
 * 返回：StyleAnalysis + markdown + fallback 标记
 *
 * 兜底策略：demo=true、DEMO_MODE=1、未配置 Key、AI 调用失败 → 返回演示数据，
 * 保证演示链路永远可走通（fallback: true 时前端可提示）。
 */
import { NextRequest, NextResponse } from "next/server";
import { analyzeImages } from "@/lib/doubao";
import { renderMarkdown } from "@/lib/md";
import { readUpload } from "@/lib/store";
import { DEMO_ANALYSIS } from "@/lib/demo";
import type { StyleAnalysis } from "@/lib/schema";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.imageIds) || body.imageIds.length === 0) {
    return NextResponse.json({ error: "缺少 imageIds" }, { status: 400 });
  }
  const imageIds: string[] = body.imageIds.slice(0, 10);
  const primaryImageIds: string[] = body.primaryImageIds ?? [];

  const useDemo =
    body.demo === true ||
    process.env.DEMO_MODE === "1" ||
    !process.env.ARK_API_KEY ||
    !process.env.ARK_MODEL;

  let analysis: StyleAnalysis;
  let fallback = false;

  if (useDemo) {
    analysis = DEMO_ANALYSIS;
    fallback = true;
  } else {
    try {
      // 按上传顺序读图并转 base64，编号从 1 开始
      const images = [];
      for (const id of imageIds) {
        const buf = await readUpload(id);
        if (!buf) throw new Error(`图片不存在或已删除：${id}`);
        images.push({ base64: buf.toString("base64"), mime: "image/jpeg" });
      }
      const primaryIndexes = primaryImageIds
        .map((pid) => imageIds.indexOf(pid) + 1)
        .filter((i) => i > 0);
      analysis = await analyzeImages(images, primaryIndexes);
    } catch (err) {
      console.error("[analyze] AI 调用失败，回退演示数据：", err);
      analysis = DEMO_ANALYSIS;
      fallback = true;
    }
  }

  return NextResponse.json({
    ...analysis,
    markdown: renderMarkdown(analysis),
    source: { imageIds, primaryImageIds },
    fallback,
  });
}
