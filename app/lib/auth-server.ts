import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "./supabase-config";

export type AuthContext = {
  user: User;
  userId: string;
  supabase: SupabaseClient;
};

export type AuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; response: NextResponse };

export function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer ([^\s]+)$/.exec(value);
  return match?.[1] ?? null;
}

export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "未登录" }, { status: 401 }),
    };
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  const supabase = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "登录已失效" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    context: { user: data.user, userId: data.user.id, supabase },
  };
}

/** 检查 Supabase 是否已配置 */
export function isSupabaseConfigured(): boolean {
  try {
    getSupabasePublicConfig();
    return true;
  } catch {
    return false;
  }
}

const LOCAL_USER_ID = "local-user";

/** 获取认证上下文：Supabase 模式 / 本地回退模式 */
export async function getRequestAuth(req: NextRequest): Promise<
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  if (isSupabaseConfigured()) {
    const auth = await authenticateRequest(req);
    if (!auth.ok) return auth;
    return { ok: true, userId: auth.context.userId, supabase: auth.context.supabase };
  }
  // 本地回退：无 Supabase 配置时，使用固定用户 ID
  return { ok: true, userId: LOCAL_USER_ID, supabase: null as unknown as SupabaseClient };
}
