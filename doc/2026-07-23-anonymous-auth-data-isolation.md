# Anonymous Auth and User Data Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect StyleSlice to the new empty Supabase project, create an anonymous browser session, and enforce per-user isolation for every style record and uploaded image.

**Architecture:** A client-side auth provider owns the anonymous Supabase session and sends the current access token to every Next.js API request. Each API verifies that token and creates a request-scoped Supabase client carrying the user's JWT, so PostgreSQL and Storage RLS remain the final authorization boundary. Images stay in a private bucket under `<user_id>/<image_id>.<ext>` and are loaded through an authenticated blob-image component.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, `@supabase/supabase-js` 2.x, Vitest, Supabase Auth/PostgreSQL/Storage.

---

## File map

- Create `app/lib/supabase-config.ts`: validate public Supabase URL and publishable key.
- Create `app/lib/supabase-browser.ts`: browser client singleton.
- Create `app/lib/auth-server.ts`: parse Bearer tokens, verify users, and return a user-scoped server client.
- Create `app/lib/auth-fetch.ts`: attach access tokens and retry one `401` after session refresh.
- Create `app/app/auth-provider.tsx`: initialize/restore anonymous sessions and expose authenticated fetch.
- Create `app/app/authenticated-image.tsx`: download private images with Bearer auth and render blob URLs.
- Modify `app/app/layout.tsx`: wrap the application in `AuthProvider`.
- Modify `app/app/page.tsx`: replace raw API fetches and protected `<img>` URLs.
- Modify `app/lib/store.ts`: accept a request-scoped client and trusted user ID; remove service-role access.
- Modify all five API route modules: authenticate before parsing or accessing user resources.
- Modify `app/.env.local.example`: document new URL and publishable key variables.
- Create `app/tests/*.test.ts`: unit and route-auth tests.
- Create `app/test-user-isolation.mjs`: real two-user Supabase/API isolation check.

### Task 1: Test runner and Supabase configuration

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/.env.local.example`
- Create: `app/lib/supabase-config.ts`
- Create: `app/tests/supabase-config.test.ts`

- [ ] **Step 1: Install the test runner**

Run from `app/`:

```powershell
npm.cmd install --save-dev vitest
```

Add scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write the failing configuration tests**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getSupabasePublicConfig } from "@/lib/supabase-config";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("getSupabasePublicConfig", () => {
  it("returns the project URL and publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    expect(getSupabasePublicConfig()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });

  it("throws when either public value is missing", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(() => getSupabasePublicConfig()).toThrow("Supabase public configuration");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm.cmd test -- tests/supabase-config.test.ts`

Expected: FAIL because `@/lib/supabase-config` does not exist.

- [ ] **Step 4: Add the minimal configuration module**

```ts
export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !publishableKey) {
    throw new Error("Missing Supabase public configuration");
  }
  return { url, publishableKey };
}
```

Update `.env.local.example` to contain:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

Remove the documented browser dependency on `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 5: Run and commit**

Run: `npm.cmd test -- tests/supabase-config.test.ts`

Expected: 2 tests pass.

```powershell
git add app/package.json app/package-lock.json app/.env.local.example app/lib/supabase-config.ts app/tests/supabase-config.test.ts
git commit -m "test: add Supabase configuration contract"
```

### Task 2: Server authentication boundary

**Files:**
- Create: `app/lib/auth-server.ts`
- Create: `app/tests/auth-server.test.ts`

- [ ] **Step 1: Write Bearer-token tests**

```ts
import { describe, expect, it } from "vitest";
import { parseBearerToken } from "@/lib/auth-server";

describe("parseBearerToken", () => {
  it("accepts one Bearer token", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it.each([null, "", "Basic abc", "Bearer", "Bearer a b"])(
    "rejects %s",
    (value) => expect(parseBearerToken(value)).toBeNull()
  );
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm.cmd test -- tests/auth-server.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the request-scoped auth context**

```ts
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
```

- [ ] **Step 4: Run and commit**

Run: `npm.cmd test -- tests/auth-server.test.ts`

Expected: all token parsing tests pass.

```powershell
git add app/lib/auth-server.ts app/tests/auth-server.test.ts
git commit -m "feat: add request-scoped Supabase authentication"
```

### Task 3: User-scoped database and private Storage

**Files:**
- Modify: `app/lib/store.ts`
- Create: `app/tests/store-paths.test.ts`

- [ ] **Step 1: Write path tests**

```ts
import { describe, expect, it } from "vitest";
import { buildUploadPath } from "@/lib/store";

describe("buildUploadPath", () => {
  it("places every image inside the user's UUID folder", () => {
    expect(buildUploadPath("user-123", "image_aabbccddeeff", "image/png"))
      .toBe("user-123/image_aabbccddeeff.png");
  });
  it("rejects unsupported MIME types", () => {
    expect(() => buildUploadPath("user-123", "image_aabbccddeeff", "text/plain"))
      .toThrow("Unsupported image MIME type");
  });
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm.cmd test -- tests/store-paths.test.ts`

Expected: FAIL because `buildUploadPath` is not exported.

- [ ] **Step 3: Refactor the store**

Remove `getSupabase()` and every read of `SUPABASE_SERVICE_ROLE_KEY`. Import `type SupabaseClient` and use these signatures:

```ts
export function buildUploadPath(userId: string, imageId: string, mime: string) {
  const ext = extForMime(mime);
  if (!ext) throw new Error("Unsupported image MIME type");
  return `${userId}/${imageId}${ext}`;
}

export async function saveUpload(
  client: SupabaseClient,
  userId: string,
  buffer: Buffer,
  mime: string
) {
  const imageId = newId("image");
  const path = buildUploadPath(userId, imageId, mime);
  const { error } = await client.storage
    .from("uploads")
    .upload(path, buffer, { contentType: mime, upsert: false });
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
      .from("uploads")
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
```

Change the style functions to accept `(client, userId, ...)`. Every query includes `.eq("user_id", userId)`; `createStyle` inserts `user_id: userId`. `getStyle` uses `.maybeSingle()` so a foreign style ID and a missing style ID both produce `null`. `updateStyle` and `deleteStyle` keep the same user filter in addition to RLS.

- [ ] **Step 4: Run and commit**

Run: `npm.cmd test -- tests/store-paths.test.ts`

Expected: 2 tests pass.

```powershell
git add app/lib/store.ts app/tests/store-paths.test.ts
git commit -m "feat: scope styles and uploads to authenticated users"
```

### Task 4: Protect every API route

**Files:**
- Modify: `app/app/api/upload/route.ts`
- Modify: `app/app/api/analyze/route.ts`
- Modify: `app/app/api/images/[id]/route.ts`
- Modify: `app/app/api/styles/route.ts`
- Modify: `app/app/api/styles/[id]/route.ts`
- Create: `app/tests/api-auth.test.ts`

- [ ] **Step 1: Write the failing unauthenticated route tests**

```ts
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as listStyles } from "@/app/api/styles/route";
import { GET as getStyle } from "@/app/api/styles/[id]/route";
import { GET as getImage } from "@/app/api/images/[id]/route";

const request = (path: string) => new NextRequest(`http://localhost${path}`);

describe("protected APIs", () => {
  it("rejects a style list without a token", async () => {
    expect((await listStyles(request("/api/styles"))).status).toBe(401);
  });
  it("rejects a style detail without a token", async () => {
    expect((await getStyle(request("/api/styles/style_aabbccddeeff"), {
      params: { id: "style_aabbccddeeff" },
    })).status).toBe(401);
  });
  it("rejects an image without a token", async () => {
    expect((await getImage(request("/api/images/image_aabbccddeeff"), {
      params: { id: "image_aabbccddeeff" },
    })).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm.cmd test -- tests/api-auth.test.ts`

Expected: at least one route returns a non-401 response or throws before authentication.

- [ ] **Step 3: Authenticate at the top of every handler**

At the start of each handler, before reading a body or touching storage, add:

```ts
const auth = await authenticateRequest(req);
if (!auth.ok) return auth.response;
const { supabase, userId } = auth.context;
```

Pass `supabase` and `userId` into every store call. Preserve existing `400`, `404`, `422`, `502`, and `503` behavior after authentication. In the image response replace the cache header with:

```ts
"Cache-Control": "private, no-store"
```

Foreign IDs must return the same `404` body as nonexistent IDs.

- [ ] **Step 4: Run and commit**

Run: `npm.cmd test -- tests/api-auth.test.ts`

Expected: all unauthenticated route tests pass.

```powershell
git add app/app/api app/tests/api-auth.test.ts
git commit -m "feat: require authentication for user APIs"
```

### Task 5: Anonymous browser session and authenticated fetch

**Files:**
- Create: `app/lib/supabase-browser.ts`
- Create: `app/lib/auth-fetch.ts`
- Create: `app/app/auth-provider.tsx`
- Modify: `app/app/layout.tsx`
- Create: `app/tests/auth-fetch.test.ts`

- [ ] **Step 1: Write retry behavior tests**

Create a test around `createAuthenticatedFetch(getToken, refresh, fetchImpl)` proving that it adds `Authorization: Bearer <token>`, preserves caller headers, refreshes once after `401`, and never retries a second `401`.

```ts
import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedFetch } from "@/lib/auth-fetch";

it("refreshes once after a 401", async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(new Response("ok", { status: 200 }));
  const refresh = vi.fn().mockResolvedValue("new-token");
  const authFetch = createAuthenticatedFetch(() => "old-token", refresh, fetchImpl);
  const response = await authFetch("/api/styles");
  expect(response.status).toBe(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[1][1].headers.get("Authorization"))
    .toBe("Bearer new-token");
});
```

- [ ] **Step 2: Run it and verify failure**

Run: `npm.cmd test -- tests/auth-fetch.test.ts`

Expected: FAIL because `auth-fetch.ts` does not exist.

- [ ] **Step 3: Implement the browser client and fetch helper**

`supabase-browser.ts` creates one client from `getSupabasePublicConfig()`. `auth-fetch.ts` merges headers with `new Headers(init?.headers)`, sets the Bearer token, retries only once after a successful refresh, and throws `匿名登录尚未就绪` when no token exists.

- [ ] **Step 4: Implement `AuthProvider`**

On mount:

1. Subscribe to `onAuthStateChange` and retain the newest access token.
2. Call `getSession()`.
3. If there is no session, call `signInAnonymously()`.
4. Render a mobile loading page while initialization is pending.
5. Render a retry button if initialization fails.
6. Expose `{ authFetch, accessToken }` through `useAuth()`.
7. Unsubscribe on unmount.

Wrap `{children}` with `<AuthProvider>` in `layout.tsx`. Do not render the application underneath a failed or incomplete session.

- [ ] **Step 5: Run and commit**

Run: `npm.cmd test -- tests/auth-fetch.test.ts`

Expected: all fetch/header/retry tests pass.

```powershell
git add app/lib/supabase-browser.ts app/lib/auth-fetch.ts app/app/auth-provider.tsx app/app/layout.tsx app/tests/auth-fetch.test.ts
git commit -m "feat: initialize anonymous browser sessions"
```

### Task 6: Use authenticated APIs and render private images

**Files:**
- Create: `app/app/authenticated-image.tsx`
- Modify: `app/app/page.tsx`

- [ ] **Step 1: Create the private image component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  imageId: string;
};

export function AuthenticatedImage({ imageId, alt, ...props }: Props) {
  const { authFetch } = useAuth();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    authFetch(`/api/images/${imageId}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("图片读取失败");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => active && setSrc(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authFetch, imageId]);

  if (!src) return <div className="slice-source-image" aria-label="图片加载中" />;
  return <img {...props} src={src} alt={alt} />;
}
```

- [ ] **Step 2: Replace all application API calls**

In `page.tsx`, call `const { authFetch } = useAuth()` and replace each user API `fetch(...)` with `authFetch(...)`: list, upload, analyze, create style, detail update, and delete if present. Static assets under `/icons` remain normal URLs.

Replace:

```tsx
<img src={`/api/images/${sourceImageId}`} ... />
```

with:

```tsx
<AuthenticatedImage
  imageId={sourceImageId}
  className="slice-source-image"
  alt={`${style.name} 原始参考图`}
  loading="lazy"
/>
```

- [ ] **Step 3: Verify and commit**

Run: `npm.cmd test`

Expected: all unit and route-auth tests pass.

Run: `npm.cmd run build`

Expected: Next.js production build exits 0.

```powershell
git add app/app/page.tsx app/app/authenticated-image.tsx
git commit -m "feat: use authenticated APIs and private images"
```

### Task 7: Real A/B-user isolation verification

**Files:**
- Create: `app/test-user-isolation.mjs`
- Modify: `app/package.json`

- [ ] **Step 1: Add an integration script**

The script creates Supabase clients A and B using the public URL/key, calls `signInAnonymously()` for both, and sends each session JWT to the local Next.js API. It must assert:

- requests without a token return `401`;
- A and B receive different user IDs;
- A uploads an image and creates a style;
- A lists and reads its style;
- B cannot read, update, or delete A's style and receives `404`;
- B cannot fetch A's image and receives `404`;
- B's style list does not contain A's style;
- uploaded object names begin with A's user UUID.

Add:

```json
"test:isolation": "node test-user-isolation.mjs"
```

The script must delete its own test rows and objects through user-scoped API calls in `finally`; it must never use a secret or service-role key.

- [ ] **Step 2: Configure local-only values**

The user adds the following to `app/.env.local`, without committing the file or sharing values in chat:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<new project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<new project publishable key>
```

Keep Vercel Production pointed at the old deployment during this test.

- [ ] **Step 3: Run the full verification**

Terminal 1:

```powershell
npm.cmd run dev
```

Terminal 2:

```powershell
npm.cmd test
npm.cmd run test:isolation
npm.cmd run build
```

Expected: unit tests pass, all A/B assertions pass, and the production build exits 0.

- [ ] **Step 4: Manual mobile acceptance**

Open the local site in a mobile-width browser and verify:

1. The loading screen disappears after anonymous login.
2. Upload, analysis, save, archive list, detail, and original image display work.
3. Clearing site data creates a new anonymous user with an empty archive.
4. Supabase `Authentication → Users` shows the anonymous accounts.
5. `styles.user_id` is never null.
6. Storage object names always begin with a user UUID folder.

- [ ] **Step 5: Commit**

```powershell
git add app/test-user-isolation.mjs app/package.json app/package-lock.json
git commit -m "test: verify anonymous user data isolation"
```

### Task 8: Preview cutover and production handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-23-anonymous-auth-data-isolation-design.md` only if implementation changes the approved design.

- [ ] **Step 1: Push the feature branch and deploy a Vercel Preview**

Configure only the Preview environment with the new project's URL and publishable key. Do not add a secret/service-role key to browser-visible variables.

- [ ] **Step 2: Repeat the A/B-user and mobile acceptance checks against Preview**

Expected: the Preview deployment behaves identically to local verification and no request uses the old Supabase project.

- [ ] **Step 3: Review Security Advisor**

In Supabase, open Security Advisor. Resolve findings concerning `public.styles`, `storage.objects`, missing RLS, or overly broad `anon`/`authenticated` access before production.

- [ ] **Step 4: Production cutover**

After Preview approval, update the two Production environment variables, redeploy, and run a production smoke test. Keep the old Supabase project unchanged until the new deployment has remained stable; rollback means restoring the prior Vercel deployment/environment values, not synchronizing data.