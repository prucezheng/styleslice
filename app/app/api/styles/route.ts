/**
 * GET  /api/styles        资料库列表（用户隔离）
 * POST /api/styles        保存风格
 */
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, isSupabaseConfigured } from "@/lib/auth-server";
import { listStyles, listStylesLocal, createStyle, createStyleLocal } from "@/lib/store";
import { renderMarkdown, renderPrompt, renderPromptShort } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

export async function GET(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  const styles = isSupabaseConfigured()
    ? await listStyles(supabase, userId)
    : await listStylesLocal(userId);
  return NextResponse.json({ styles });
}

export async function POST(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  const body = await req.json().catch(() => null);
  if (!body || !body.name) {
    return NextResponse.json({ error: "缺少风格数据" }, { status: 400 });
  }
  const { markdown: _ignored, prompt: _p, promptShort: _ps, fallback: _f, source, ...analysis } = body;
  const md = renderMarkdown(analysis as StyleAnalysis);
  const prompt = renderPrompt(analysis as StyleAnalysis);
  const promptShort = renderPromptShort(analysis as StyleAnalysis);
  const style = isSupabaseConfigured()
    ? await createStyle(supabase, userId, {
        ...(analysis as StyleAnalysis),
        markdown: md,
        prompt,
        promptShort,
        source: source ?? { imageIds: [], primaryImageIds: [] },
      } as Parameters<typeof createStyle>[2])
    : await createStyleLocal(userId, {
        ...(analysis as StyleAnalysis),
        markdown: md,
        prompt,
        promptShort,
        source: source ?? { imageIds: [], primaryImageIds: [] },
      } as Parameters<typeof createStyleLocal>[1]);
  return NextResponse.json(style, { status: 201 });
}
