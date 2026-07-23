/**
 * 创建自动附加 Bearer token 的 fetch 函数，
 * 在收到 401 时自动尝试刷新 session 一次并重试。
 */

type TokenGetter = () => string | null;
type TokenRefresh = () => Promise<string | null>;

export function createAuthenticatedFetch(
  getToken: TokenGetter,
  refresh: TokenRefresh,
  fetchImpl: typeof globalThis.fetch = fetch
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getToken();
    if (!token) throw new Error("匿名登录尚未就绪");

    const authHeaders = new Headers(init?.headers);
    authHeaders.set("Authorization", `Bearer ${token}`);

    const response = await fetchImpl(input, { ...init, headers: authHeaders });

    if (response.status === 401) {
      const newToken = await refresh();
      if (newToken) {
        const retryHeaders = new Headers(init?.headers);
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
        return fetchImpl(input, { ...init, headers: retryHeaders });
      }
    }

    return response;
  };
}
