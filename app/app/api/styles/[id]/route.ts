/**
 * GET    /api/styles/:id  风格详情
 * PATCH  /api/styles/:id  更新（用户编辑后重新渲染 MD，版本 +1）
 * DELETE /api/styles/:id  删除
 * 需要请求头: x-user-id
 */
import { NextRequest, NextResponse } from "next/server";
import { getStyle, updateStyle, deleteStyle, requireUserId } from "@/lib/store";
import { renderMarkdown, renderPrompt } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

type Ctx = { params: { id: string } };

function getUserId(req: NextRequest) {
  return requireUserId(req.headers.get("x-user-id"));
}

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const userId = getUserId(req);
    const style = await getStyle(params.id, userId);
    if (!style) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
    return NextResponse.json(style);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const userId = getUserId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "请求体错误" }, { status: 400 });
    const patch = { ...body };
    delete patch.styleId;
    delete patch.version;
    delete patch.createdAt;
    delete patch.updatedAt;
    delete patch.markdown;
    delete patch.prompt;
    const current = await getStyle(params.id, userId);
    if (!current) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
    const merged = { ...current, ...patch };
    const { markdown: _m, prompt: _p, source: _s, ...analysis } = merged;
    patch.markdown = renderMarkdown(analysis as StyleAnalysis);
    patch.prompt = renderPrompt(analysis as StyleAnalysis);
    const updated = await updateStyle(params.id, patch, userId);
    if (!updated) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const userId = getUserId(req);
    const ok = await deleteStyle(params.id, userId);
    if (!ok) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
