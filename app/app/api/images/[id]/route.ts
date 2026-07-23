/**
 * GET /api/images/:id
 * 返回用户私有图片（需认证）
 */
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, isSupabaseConfigured } from "@/lib/auth-server";
import { readUpload, readUploadLocal, isValidId } from "@/lib/store";

type Ctx = { params: { id: string } };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  if (!isValidId(params.id)) {
    return NextResponse.json({ error: "非法的图片 ID" }, { status: 400 });
  }
  const file = isSupabaseConfigured()
    ? await readUpload(supabase, userId, params.id)
    : await readUploadLocal(userId, params.id);
  if (!file) {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "private, no-store",
    },
  });
}
