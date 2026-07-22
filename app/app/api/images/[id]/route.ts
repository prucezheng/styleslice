/**
 * GET /api/images/:id
 * 返回原图（从 Supabase Storage 读取后直接输出）
 */
import { NextRequest, NextResponse } from "next/server";
import { readUpload, isValidId } from "@/lib/store";

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!isValidId(params.id)) {
    return NextResponse.json({ error: "非法的图片 ID" }, { status: 400 });
  }
  const file = await readUpload(params.id);
  if (!file) {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
