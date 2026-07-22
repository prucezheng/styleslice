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

/* ---------- 简易写锁（防止并发读写覆盖） ---------- */

let writeQueue: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    writeQueue = writeQueue.then(fn).then(resolve, reject);
  });
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

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".bin": "application/octet-stream",
};

const ID_PATTERN = /^[a-z]+_[0-9a-f]{12}$/;

/** 校验 ID 格式，防止路径穿越 / 越权读取 uploads 之外的文件 */
export function isValidId(id: string): boolean {
  return typeof id === "string" && ID_PATTERN.test(id);
}

/** 解析上传文件路径，并确认仍在 uploads 目录内 */
function resolveUploadPath(fileName: string): string | null {
  const resolved = path.resolve(UPLOAD_DIR, fileName);
  return resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep) ? resolved : null;
}

export async function readUpload(
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    const filePath = resolveUploadPath(imageId + ext);
    if (!filePath) continue;
    try {
      const buffer = await fs.readFile(filePath);
      return { buffer, mime: EXT_TO_MIME[ext] ?? "application/octet-stream" };
    } catch {
      /* try next */
    }
  }
  return null;
}

/* ---------- 风格资料库 ---------- */

async function readAll(): Promise<StyleResult[]> {
  let raw: string;
  try {
    raw = await fs.readFile(STYLES_FILE, "utf-8");
  } catch (err) {
    // 只有「文件不存在」视为空库；权限等错误向上抛，避免后续写入覆盖原数据
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    // styles.json 损坏：备份后抛错，防止静默覆盖
    const backup = STYLES_FILE + ".broken-" + Date.now();
    await fs.copyFile(STYLES_FILE, backup).catch(() => {});
    throw new Error(`styles.json 解析失败，已备份到 ${path.basename(backup)}`);
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
  return withLock(async () => {
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
  });
}

export async function updateStyle(
  styleId: string,
  patch: Partial<StyleResult>
): Promise<StyleResult | null> {
  return withLock(async () => {
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
  });
}

export async function deleteStyle(styleId: string): Promise<boolean> {
  return withLock(async () => {
    const all = await readAll();
    const next = all.filter((s) => s.styleId !== styleId);
    if (next.length === all.length) return false;
    await writeAll(next);
    return true;
  });
}
