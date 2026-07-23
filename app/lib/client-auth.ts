/**
 * 浏览器端 Supabase 客户端（匿名登录用）
 * 需要环境变量: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("缺少 Supabase 客户端配置");
  }
  client = createClient(url, key);
  return client;
}

let cachedUserId: string | null = null;

/** 确保已匿名登录，返回 user_id。已登录则直接返回缓存。 */
export async function ensureAnonymousAuth(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const supabase = getClient();

  // 先检查是否已有会话
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user?.id) {
    cachedUserId = sessionData.session.user.id;
    return cachedUserId;
  }

  // 否则匿名登录
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`匿名登录失败：${error.message}`);
  if (!data.user?.id) throw new Error("匿名登录未返回用户 ID");

  cachedUserId = data.user.id;
  return cachedUserId;
}

/** 获取已缓存的 user_id（不会触发登录） */
export function getCachedUserId(): string | null {
  return cachedUserId;
}
