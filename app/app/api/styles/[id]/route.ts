/**
 * GET    /api/styles/:id  风格详情
 * PATCH  /api/styles/:id  更新
 * DELETE /api/styles/:id  删除
 */
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, isSupabaseConfigured } from "@/lib/auth-server";
import { getStyle, getStyleLocal, updateStyle, deleteStyle } from "@/lib/store";
import { renderMarkdown, renderPrompt, renderPromptShort } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  const style = isSupabaseConfigured()
    ? await getStyle(supabase, userId, params.id)
    : await getStyleLocal(userId, params.id);
  if (!style) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json(style);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "请求体错误" }, { status: 400 });
  const patch = { ...body };
  delete patch.styleId;
  delete patch.version;
  delete patch.createdAt;
  delete patch.updatedAt;
  delete patch.markdown;
  delete patch.prompt;
  delete patch.promptShort;

  const current = isSupabaseConfigured()
    ? await getStyle(supabase, userId, params.id)
    : await getStyleLocal(userId, params.id);
  if (!current) return NextResponse.json({ error: "风格不存在" }, { status: 404 });

  const merged = { ...current, ...patch };
  const { markdown: _m, prompt: _p, promptShort: _ps, source: _s, ...analysis } = merged;
  patch.markdown = renderMarkdown(analysis as StyleAnalysis);
  patch.prompt = renderPrompt(analysis as StyleAnalysis);
  patch.promptShort = renderPromptShort(analysis as StyleAnalysis);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "本地模式下暂不支持更新" }, { status: 501 });
  }

  const updated = await updateStyle(supabase, userId, params.id, patch);
  if (!updated) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "本地模式下暂不支持删除" }, { status: 501 });
  }

  const ok = await deleteStyle(supabase, userId, params.id);
  if (!ok) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
