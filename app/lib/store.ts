/**
 * 极简 JSON 文件存储（MVP 单用户，无需数据库）
 * 数据目录：app/data/
 *   - styles.json      风格资料库
 *   - uploads/         上传的原始图片
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { StyleResult } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const STYLES_FILE = path.join(DATA_DIR, "styles.json");

async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

/* ---------- 上传图片 ---------- */

const EXT_MAP: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function extForMime(mime: string): string | null {
  return EXT_MAP[mime] ?? null;
}

export async function saveUpload(buffer: Buffer, mime: string) {
  await ensureDirs();
  const imageId = newId("image");
  const ext = extForMime(mime) ?? ".bin";
  await fs.writeFile(path.join(UPLOAD_DIR, imageId + ext), buffer);
  return { imageId, fileName: imageId + ext };
}

export async function readUpload(imageId: string): Promise<Buffer | null> {
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    try {
      return await fs.readFile(path.join(UPLOAD_DIR, imageId + ext));
    } catch {
      /* try next */
    }
  }
  return null;
}

/* ---------- 风格资料库 ---------- */

async function readAll(): Promise<StyleResult[]> {
  try {
    return JSON.parse(await fs.readFile(STYLES_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function writeAll(styles: StyleResult[]) {
  await ensureDirs();
  await fs.writeFile(STYLES_FILE, JSON.stringify(styles, null, 2), "utf-8");
}

export async function listStyles(): Promise<StyleResult[]> {
  const all = await readAll();
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getStyle(styleId: string): Promise<StyleResult | null> {
  return (await readAll()).find((s) => s.styleId === styleId) ?? null;
}

export async function createStyle(
  data: Omit<StyleResult, "styleId" | "version" | "createdAt" | "updatedAt">
): Promise<StyleResult> {
  const now = new Date().toISOString();
  const style: StyleResult = {
    ...data,
    styleId: newId("style"),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const all = await readAll();
  all.push(style);
  await writeAll(all);
  return style;
}

export async function updateStyle(
  styleId: string,
  patch: Partial<StyleResult>
): Promise<StyleResult | null> {
  const all = await readAll();
  const idx = all.findIndex((s) => s.styleId === styleId);
  if (idx === -1) return null;
  const prev = all[idx];
  all[idx] = {
    ...prev,
    ...patch,
    styleId: prev.styleId,
    version: prev.version + 1,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeAll(all);
  return all[idx];
}

export async function deleteStyle(styleId: string): Promise<boolean> {
  const all = await readAll();
  const next = all.filter((s) => s.styleId !== styleId);
  if (next.length === all.length) return false;
  await writeAll(next);
  return true;
}
