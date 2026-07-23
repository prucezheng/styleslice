/**
 * 存储层：Supabase（线上）／本地文件系统（开发模式）
 * 当未配置 Supabase 环境变量时，自动回退到 .data/ 本地目录
 *
 * 环境变量（Supabase Dashboard → Settings → API）：
 *   NEXT_PUBLIC_SUPABASE_URL      项目 URL
 *   SUPABASE_SERVICE_ROLE_KEY     service_role key（服务端操作）
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";

import crypto from "crypto";
import type { StyleResult } from "./schema";

/* ---------- 数据目录 ---------- */

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

/* ---------- Supabase 客户端 ---------- */

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _supabase: any;

function getSupabase() {
  if (_supabase === undefined) {
    _supabase = getSupabaseClient();
  }
  if (!_supabase) {
    throw new Error("未配置 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }
  return _supabase;
}

export function isSupabaseAvailable(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && key);
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

/* ---------- 图片上传 ---------- */

const BUCKET = "uploads";

export async function saveUpload(buffer: Buffer, mime: string) {
  const imageId = newId("image");
  const ext = extForMime(mime) ?? ".bin";
  const fileName = `${imageId}${ext}`;

  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, { contentType: mime, upsert: false });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

    return { imageId, url: publicUrl };
  }

  // 本地文件系统回退
  await ensureDataDir();
  await fs.writeFile(path.join(UPLOADS_DIR, fileName), buffer);
  return { imageId, url: `/api/images/${imageId}` };
}

export async function readUpload(
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;

  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
      const filePath = `${imageId}${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET).download(filePath);
      if (error || !data) continue;
      const mime = EXT_TO_MIME[ext] ?? "application/octet-stream";
      return { buffer: Buffer.from(await data.arrayBuffer()), mime };
    }
    return null;
  }

  // 本地文件系统回退
  await ensureDataDir();
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    const filePath = path.join(UPLOADS_DIR, `${imageId}${ext}`);
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

/* ---------- 本地风格存储工具 ---------- */

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

export async function listStyles(): Promise<StyleResult[]> {
  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("styles")
      .select("data")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row: { data: StyleResult }) => row.data);
  }

  // 本地文件系统回退：按 updatedAt 降序
  const styles = await readLocalStyles();
  return styles.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getStyle(styleId: string): Promise<StyleResult | null> {
  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("styles")
      .select("data")
      .eq("style_id", styleId)
      .single();

    if (error || !data) return null;
    return (data as { data: StyleResult }).data;
  }

  const styles = await readLocalStyles();
  return styles.find((s) => s.styleId === styleId) ?? null;
}

export async function createStyle(
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

  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { error } = await supabase.from("styles").insert({
      style_id: style.styleId,
      data: style,
      created_at: now,
      updated_at: now,
    });

    if (error) throw error;
    return style;
  }

  const styles = await readLocalStyles();
  styles.push(style);
  await writeLocalStyles(styles);
  return style;
}

export async function updateStyle(
  styleId: string,
  patch: Partial<StyleResult>
): Promise<StyleResult | null> {
  const current = await getStyle(styleId);
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

  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("styles")
      .update({ data: merged, updated_at: now })
      .eq("style_id", styleId);

    if (error) throw error;
    return merged;
  }

  const styles = await readLocalStyles();
  const index = styles.findIndex((s) => s.styleId === styleId);
  if (index === -1) return null;
  styles[index] = merged;
  await writeLocalStyles(styles);
  return merged;
}

export async function deleteStyle(styleId: string): Promise<boolean> {
  if (isSupabaseAvailable()) {
    const supabase = getSupabase();
    const { error, count } = await supabase
      .from("styles")
      .delete({ count: "exact" })
      .eq("style_id", styleId);

    if (error) throw error;
    return (count ?? 0) > 0;
  }

  const styles = await readLocalStyles();
  const index = styles.findIndex((s) => s.styleId === styleId);
  if (index === -1) return false;
  styles.splice(index, 1);
  await writeLocalStyles(styles);
  return true;
}
