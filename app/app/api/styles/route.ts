/**
 * GET  /api/styles        资料库列表
 * POST /api/styles        保存风格（body 为分析结果 + source，服务端重新渲染 MD）
 * 需要请求头: x-user-id（匿名登录后的 Supabase user_id）
 */
import { NextRequest, NextResponse } from "next/server";
import { listStyles, createStyle, requireUserId } from "@/lib/store";
import { renderMarkdown, renderPrompt } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

function getUserId(req: NextRequest) {
  return requireUserId(req.headers.get("x-user-id"));
}

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    return NextResponse.json({ styles: await listStyles(userId) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const body = await req.json().catch(() => null);
    if (!body || !body.name) {
      return NextResponse.json({ error: "缺少风格数据" }, { status: 400 });
    }
    const { markdown: _ignored, prompt: _p, fallback: _f, source, ...analysis } = body;
    const md = renderMarkdown(analysis as StyleAnalysis);
    const prompt = renderPrompt(analysis as StyleAnalysis);
    const style = await createStyle({
      ...(analysis as StyleAnalysis),
      markdown: md,
      prompt,
      source: source ?? { imageIds: [], primaryImageIds: [] },
    }, userId);
    return NextResponse.json(style, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
