/**
 * Supabase 存储层：Storage（图片） + PostgreSQL（资料库）
 *
 * 环境变量（Supabase Dashboard → Settings → API）：
 *   NEXT_PUBLIC_SUPABASE_URL           项目 URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY      匿名客户端 key（前端用）
 *   SUPABASE_SERVICE_ROLE_KEY          service_role key（服务端操作）
 *
 * 每个用户通过 Supabase 匿名登录获得唯一 user_id，
 * 所有资料库操作按 user_id 隔离，确保私有灵感库。
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import type { StyleResult } from "./schema";

/* ---------- Supabase 客户端 ---------- */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("未配置 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
}

/* ---------- ID 工具 ---------- */

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

const ID_PATTERN = /^[a-z]+_[0-9a-f]{12}$/;

export function isValidId(id: string): boolean {
  return typeof id === "string" && ID_PATTERN.test(id);
}

/* ---------- MIME 工具 ---------- */

export function extForMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return map[mime] ?? null;
}

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
};

/* ---------- 图片上传（Supabase Storage） ---------- */

const BUCKET = "uploads";

export async function saveUpload(buffer: Buffer, mime: string) {
  const supabase = getSupabase();
  const imageId = newId("image");
  const ext = extForMime(mime) ?? ".bin";
  const path = `${imageId}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mime, upsert: false });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { imageId, url: publicUrl };
}

export async function readUpload(
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;
  const supabase = getSupabase();
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    const path = `${imageId}${ext}`;
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) continue;
    const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
    return { buffer: Buffer.from(await data.arrayBuffer()), mime };
  }
  return null;
}

/* ---------- 用户上下文 ---------- */

export function requireUserId(userId: string | null | undefined): string {
  if (!userId || typeof userId !== "string" || userId.length < 3) {
    throw new Error("未登录，请刷新页面后重试");
  }
  return userId;
}

/* ---------- 风格资料库（Supabase PostgreSQL） ---------- */

export async function listStyles(userId: string): Promise<StyleResult[]> {
  requireUserId(userId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("styles")
    .select("data")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: { data: StyleResult }) => row.data);
}

export async function getStyle(styleId: string, userId: string): Promise<StyleResult | null> {
  requireUserId(userId);
  if (!isValidId(styleId)) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("styles")
    .select("data")
    .eq("style_id", styleId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return (data as { data: StyleResult }).data;
}

export async function createStyle(
  input: Omit<StyleResult, "styleId" | "version" | "createdAt" | "updatedAt">,
  userId: string
): Promise<StyleResult> {
  requireUserId(userId);
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const style: StyleResult = {
    ...input,
    styleId: newId("style"),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const { error } = await supabase.from("styles").insert({
    style_id: style.styleId,
    user_id: userId,
    data: style,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;
  return style;
}

export async function updateStyle(
  styleId: string,
  patch: Partial<StyleResult>,
  userId: string
): Promise<StyleResult | null> {
  requireUserId(userId);
  const supabase = getSupabase();
  const current = await getStyle(styleId, userId);
  if (!current) return null;

  const now = new Date().toISOString();
  const merged: StyleResult = {
    ...current,
    ...patch,
    styleId: current.styleId,
    version: current.version + 1,
    createdAt: current.createdAt,
    updatedAt: now,
  };

  const { error } = await supabase
    .from("styles")
    .update({ data: merged, updated_at: now })
    .eq("style_id", styleId)
    .eq("user_id", userId);

  if (error) throw error;
  return merged;
}

export async function deleteStyle(styleId: string, userId: string): Promise<boolean> {
  requireUserId(userId);
  const supabase = getSupabase();
  const { error, count } = await supabase
    .from("styles")
    .delete({ count: "exact" })
    .eq("style_id", styleId)
    .eq("user_id", userId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
