"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { createAuthenticatedFetch } from "@/lib/auth-fetch";
import { isSupabaseConfigured } from "@/lib/auth-server";

interface AuthState {
  authFetch: typeof globalThis.fetch;
  accessToken: string | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthState>({
  authFetch: typeof window !== "undefined" ? fetch.bind(window) : (() => { throw new Error("not available"); }) as unknown as typeof fetch,
  accessToken: null,
  userId: null,
  loading: true,
  error: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

/** 无 Supabase 时的本地回退：使用原始 fetch（API 端在本地模式下不检查 token） */
function useLocalFallback(): AuthState {
  return {
    authFetch: typeof window !== "undefined" ? fetch.bind(window) : (() => { throw new Error("not available"); }) as unknown as typeof fetch,
    accessToken: null,
    userId: "local-user",
    loading: false,
    error: null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // 服务端渲染时直接返回 loading
  if (typeof window === "undefined") {
    return (
      <AuthContext.Provider
        value={{
          authFetch: fetch,
          accessToken: null,
          userId: null,
          loading: true,
          error: null,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  // 无 Supabase 配置 → 本地回退
  if (!isSupabaseConfigured()) {
    const fallback = useLocalFallback();
    return <AuthContext.Provider value={fallback}>{children}</AuthContext.Provider>;
  }

  // --- Supabase 模式 ---
  const supabase = getSupabaseBrowserClient();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.refreshSession();
    const session = data.session;
    if (session) {
      setAccessToken(session.access_token);
      return session.access_token;
    }
    return null;
  }, [supabase]);

  const getToken = useCallback(() => accessToken, [accessToken]);

  const authFetch = createAuthenticatedFetch(getToken, refreshToken);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        // 监听 auth 状态变化
        const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
          if (session) {
            setAccessToken(session.access_token);
            setUserId(session.user.id);
          }
        });

        // 检查现有 session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setAccessToken(session.access_token);
          setUserId(session.user.id);
          setLoading(false);
        } else {
          // 没有 session → 匿名登录
          const { data, error: signInError } = await supabase.auth.signInAnonymously();
          if (signInError) throw signInError;
          if (data.session) {
            setAccessToken(data.session.access_token);
            setUserId(data.session.user?.id ?? null);
          }
          setLoading(false);
        }

        return () => listener?.subscription.unsubscribe();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登录失败");
        setLoading(false);
      }
    };

    init();
  }, [supabase]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          fontFamily: "system-ui, sans-serif",
          fontSize: "0.9rem",
          color: "#7d7a72",
          background: "linear-gradient(135deg, #242728 0%, #111314 100%)",
        }}
      >
        正在连接…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          color: "#ff9a76",
          background: "linear-gradient(135deg, #242728 0%, #111314 100%)",
        }}
      >
        <span>连接失败：{error}</span>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 24px",
            border: "1px solid #ff9a76",
            borderRadius: 8,
            background: "transparent",
            color: "#ff9a76",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ authFetch, accessToken, userId, loading: false, error: null }}>
      {children}
    </AuthContext.Provider>
  );
}
