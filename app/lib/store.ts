/**
 * Vercel 存储层：Vercel Blob（图片） + Upstash Redis（资料库）
 *
 * 环境变量：
 *   BLOB_READ_WRITE_TOKEN   Vercel Blob 读写令牌（集成自动注入）
 *   KV_URL / KV_REST_API_URL / KV_REST_API_TOKEN   Upstash Redis 连接信息
 *
 * 本地开发：npx vercel env pull 拉取环境变量
 */

import { put, del as blobDel, head as blobHead } from "@vercel/blob";
import { Redis } from "@upstash/redis";
import crypto from "crypto";
import type { StyleResult } from "./schema";

/* ---------- Redis 客户端（延迟初始化） ---------- */

let _redis: Redis | null = null;

function redis(): Redis {
  if (!_redis) {
    const url = process.env.KV_REST_API_URL ?? process.env.KV_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error("未配置 KV_REST_API_URL 或 KV_REST_API_TOKEN");
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

const STYLES_KEY = "styleslice:styles";
const STYLES_LOCK_KEY = "styleslice:styles:lock";

/* ---------- 简易 Redis 分布式锁 ---------- */

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const r = redis();
  const lockValue = crypto.randomBytes(8).toString("hex");
  for (let i = 0; i < 30; i++) {
    // NX: 仅当 key 不存在时 set；EX: 过期避免死锁
    const acquired = await r.set(STYLES_LOCK_KEY, lockValue, { nx: true, ex: 10 });
    if (acquired === "OK") break;
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
  }
  try {
    return await fn();
  } finally {
    // 仅释放自己持有的锁
    const current = await r.get(STYLES_LOCK_KEY);
    if (current === lockValue) {
      await r.del(STYLES_LOCK_KEY);
    }
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

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function extForMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return map[mime] ?? null;
}

/* ---------- 图片上传（Vercel Blob） ---------- */

export async function saveUpload(buffer: Buffer, mime: string) {
  const imageId = newId("image");
  const ext = extForMime(mime) ?? ".bin";
  const blob = await put(`uploads/${imageId}${ext}`, buffer, {
    access: "public",
    contentType: mime,
  });
  return { imageId, url: blob.url };
}

export async function readUpload(
  imageId: string
): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!isValidId(imageId)) return null;
  for (const ext of [".jpg", ".png", ".webp", ".bin"]) {
    try {
      const blob = await blobHead(`uploads/${imageId}${ext}`);
      if (!blob) continue;
      const res = await fetch(blob.url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const mime = blob.contentType ?? EXT_TO_MIME[ext] ?? "application/octet-stream";
      return { buffer, mime };
    } catch {
      /* try next extension */
    }
  }
  return null;
}

/* ---------- 风格资料库（Upstash Redis） ---------- */

async function readAll(): Promise<StyleResult[]> {
  const r = redis();
  const raw = await r.get<string>(STYLES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    // 数据损坏：备份后返回空
    const backup = `${STYLES_KEY}:backup:${Date.now()}`;
    await r.set(backup, raw, { ex: 86400 * 30 }); // 保留 30 天
    console.error(`styles 数据解析失败，已备份到 ${backup}`);
    throw err;
  }
}

async function writeAll(styles: StyleResult[]) {
  await redis().set(STYLES_KEY, JSON.stringify(styles));
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
