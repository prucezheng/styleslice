/**
 * POST /api/upload
 * 接收图片（multipart/form-data，字段名 files），存入用户隔离的私有 Storage。
 */
import { NextRequest, NextResponse } from "next/server";
import { getRequestAuth, isSupabaseConfigured } from "@/lib/auth-server";
import { saveUpload, saveUploadLocal, extForMime } from "@/lib/store";

const MAX_SIZE = 20 * 1024 * 1024;
const MAX_COUNT = 1;

export async function POST(req: NextRequest) {
  const auth = await getRequestAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, supabase } = auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求格式错误，需要 multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "未收到图片文件" }, { status: 400 });
  }
  if (files.length > MAX_COUNT) {
    return NextResponse.json({ error: `一次最多上传 ${MAX_COUNT} 张图片` }, { status: 400 });
  }

  const images = [];
  const failures = [];

  for (const file of files) {
    if (!extForMime(file.type)) {
      failures.push({ name: file.name, reason: "仅支持 JPG / PNG / WebP 格式" });
      continue;
    }
    if (file.size > MAX_SIZE) {
      failures.push({ name: file.name, reason: "单张图片不能超过 20MB" });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = isSupabaseConfigured()
      ? await saveUpload(supabase, userId, buffer, file.type)
      : await saveUploadLocal(userId, buffer, file.type);
    images.push({ imageId: result.imageId, url: result.url, name: file.name, size: file.size });
  }

  if (images.length === 0) {
    return NextResponse.json(
      { error: "没有可上传的图片", images, failures },
      { status: 422 }
    );
  }

  return NextResponse.json({ images, failures });
}
