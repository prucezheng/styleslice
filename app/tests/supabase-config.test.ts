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
