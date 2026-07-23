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
