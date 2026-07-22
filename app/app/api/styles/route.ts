/**
 * GET  /api/styles        资料库列表
 * POST /api/styles        保存风格（body 为分析结果 + source，服务端重新渲染 MD）
 */
import { NextRequest, NextResponse } from "next/server";
import { listStyles, createStyle } from "@/lib/store";
import { renderMarkdown } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

export async function GET() {
  return NextResponse.json({ styles: await listStyles() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.name) {
    return NextResponse.json({ error: "缺少风格数据" }, { status: 400 });
  }
  const { markdown: _ignored, fallback: _f, source, ...analysis } = body;
  const md = renderMarkdown(analysis as StyleAnalysis); // 以服务端渲染为准
  const style = await createStyle({
    ...(analysis as StyleAnalysis),
    markdown: md,
    source: source ?? { imageIds: [], primaryImageIds: [] },
  });
  return NextResponse.json(style, { status: 201 });
}
