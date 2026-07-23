/**
 * 存储层：用户隔离的 Supabase 数据库 + Storage
 * 所有操作必须通过 request-scoped Supabase client（携带用户 JWT），
 * RLS 为最终安全边界。本地文件系统回退仅用于开发且无 Supabase 配置时。
 *
 * 环境变量：
 *   NEXT_PUBLIC_SUPABASE_URL              项目 URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   发布密钥
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { StyleResult } from "./schema";

/* ---------- 数据目录（仅本地回退） ---------- */

const DATA_DIR = path.join(process.cwd(), ".data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const STYLES_FILE = path.join(DATA_DIR, "styles.json");

async function ensureDataDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  try {
    await fs.access(STYLES_FILE);
  } catch {
    await fs.writeFile(STYLES_FILE, "[]", "utf-8");
  }
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

/* ---------- 用户隔离上传路径 ---------- */

export function buildUploadPath(userId: string, imageId: string, mime: string) {
  const ext = extForMime(mime);
  if (!ext) throw new Error("Unsupported image MIME type");
  return `${userId}/${imageId}${ext}`;
}

/* ---------- 图片上传 ---------- */

const BUCKET = "uploads";

export async function saveUpload(
  client: SupabaseClient,
  userId: string,
  buffer: Buffer,
  mime: string
) {
  const imageId = newId("image");
  const storagePath = buildUploadPath(userId, imageId, mime);
  const { error } = await client.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (error) throw error;
  return { imageId, url: `/api/images/${imageId}` };
}

export async function readUpload(
  client: SupabaseClient,
  userId: string,
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;
  for (const ext of [".jpg", ".png", ".webp"]) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .download(`${userId}/${imageId}${ext}`);
    if (!error && data) {
      return {
        buffer: Buffer.from(await data.arrayBuffer()),
        mime: EXT_TO_MIME[ext],
      };
    }
  }
  return null;
}

/* ---------- 本地回退图片 ---------- */

export async function saveUploadLocal(userId: string, buffer: Buffer, mime: string) {
  await ensureDataDir();
  const imageId = newId("image");
  const ext = extForMime(mime) ?? ".bin";
  const fileName = `${userId}_${imageId}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, fileName), buffer);
  return { imageId, url: `/api/images/${imageId}` };
}

export async function readUploadLocal(
  userId: string,
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;
  await ensureDataDir();
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    const fileName = `${userId}_${imageId}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    try {
      const buffer = await fs.readFile(filePath);
      const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
      return { buffer, mime };
    } catch {
      continue;
    }
  }
  return null;
}

/* ---------- 本地风格存储（用户隔离） ---------- */

async function readLocalStyles(): Promise<StyleResult[]> {
  await ensureDataDir();
  const raw = await fs.readFile(STYLES_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeLocalStyles(styles: StyleResult[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(STYLES_FILE, JSON.stringify(styles, null, 2), "utf-8");
}

/* ---------- 风格资料库 ---------- */

export async function listStyles(client: SupabaseClient, userId: string): Promise<StyleResult[]> {
  const { data, error } = await client
    .from("styles")
    .select("data")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row: { data: StyleResult }) => row.data);
}

export async function listStylesLocal(userId: string): Promise<StyleResult[]> {
  const styles = await readLocalStyles();
  return styles
    .filter((s) => (s as StyleResult & { userId?: string }).userId === userId)
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export async function getStyle(
  client: SupabaseClient,
  userId: string,
  styleId: string
): Promise<StyleResult | null> {
  const { data, error } = await client
    .from("styles")
    .select("data")
    .eq("user_id", userId)
    .eq("style_id", styleId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { data: StyleResult }).data;
}

export async function getStyleLocal(
  userId: string,
  styleId: string
): Promise<StyleResult | null> {
  const styles = await readLocalStyles();
  return styles.find(
    (s) => s.styleId === styleId && (s as StyleResult & { userId?: string }).userId === userId
  ) ?? null;
}

export async function createStyle(
  client: SupabaseClient,
  userId: string,
  input: Omit<StyleResult, "styleId" | "version" | "createdAt" | "updatedAt">
): Promise<StyleResult> {
  const now = new Date().toISOString();
  const style: StyleResult = {
    ...input,
    styleId: newId("style"),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const { error } = await client.from("styles").insert({
    style_id: style.styleId,
    user_id: userId,
    data: style,
    created_at: now,
    updated_at: now,
  });

  if (error) throw error;
  return style;
}

export async function createStyleLocal(
  userId: string,
  input: Omit<StyleResult, "styleId" | "version" | "createdAt" | "updatedAt">
): Promise<StyleResult> {
  const now = new Date().toISOString();
  const style: StyleResult & { userId?: string } = {
    ...input,
    styleId: newId("style"),
    version: 1,
    createdAt: now,
    updatedAt: now,
    userId,
  };

  const styles = await readLocalStyles();
  styles.push(style as StyleResult);
  await writeLocalStyles(styles);
  return style as StyleResult;
}

export async function updateStyle(
  client: SupabaseClient,
  userId: string,
  styleId: string,
  patch: Partial<StyleResult>
): Promise<StyleResult | null> {
  const current = await getStyle(client, userId, styleId);
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

  const { error } = await client
    .from("styles")
    .update({ data: merged, updated_at: now })
    .eq("user_id", userId)
    .eq("style_id", styleId);

  if (error) throw error;
  return merged;
}

export async function deleteStyle(
  client: SupabaseClient,
  userId: string,
  styleId: string
): Promise<boolean> {
  const { error, count } = await client
    .from("styles")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("style_id", styleId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
