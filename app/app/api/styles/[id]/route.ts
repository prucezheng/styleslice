/**
 * GET    /api/styles/:id  风格详情
 * PATCH  /api/styles/:id  更新（用户编辑后重新渲染 MD，版本 +1）
 * DELETE /api/styles/:id  删除
 */
import { NextRequest, NextResponse } from "next/server";
import { getStyle, updateStyle, deleteStyle } from "@/lib/store";
import { renderMarkdown } from "@/lib/md";
import type { StyleAnalysis } from "@/lib/schema";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const style = await getStyle(params.id);
  if (!style) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json(style);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "请求体错误" }, { status: 400 });
  // MD 始终以服务端基于结构化数据重渲染为准，忽略客户端传入的 markdown，
  // 防止「完整对象 + 修改字段」提交时旧 MD 残留导致 JSON/MD 不一致
  const patch = { ...body };
  delete patch.styleId;
  delete patch.version;
  delete patch.createdAt;
  delete patch.updatedAt;
  delete patch.markdown;
  const current = await getStyle(params.id);
  if (!current) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  const merged = { ...current, ...patch };
  const { markdown: _m, source: _s, ...analysis } = merged;
  patch.markdown = renderMarkdown(analysis as StyleAnalysis);
  const updated = await updateStyle(params.id, patch);
  if (!updated) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const ok = await deleteStyle(params.id);
  if (!ok) return NextResponse.json({ error: "风格不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
