import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSupabasePublicConfig, hasSupabaseConfig } from "./env";

const originalEnv = { ...process.env };

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("Supabase environment configuration", () => {
  beforeEach(() => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      NODE_ENV: "test",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports a complete configuration", () => {
    expect(hasSupabaseConfig()).toBe(true);
  });

  it("throws when the URL is missing but a key is present", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined });
    expect(() => hasSupabaseConfig()).toThrow(/incomplete/i);
  });

  it("returns the local Supabase origin unchanged", () => {
    const { url, key } = getSupabasePublicConfig();
    expect(url).toBe("http://127.0.0.1:54321");
    expect(key).toBe("local-publishable-key");
  });

  it("rejects a URL with a path so requests do not hit the wrong gateway route", () => {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321/storage/v1/s3",
    });
    expect(() => getSupabasePublicConfig()).toThrow(/without a path/i);
  });

  it("rejects a URL that is not parseable", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    expect(() => getSupabasePublicConfig()).toThrow(/not a valid URL/i);
  });

  it("rejects a non-local Supabase host in development", () => {
    setEnv({
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(() => getSupabasePublicConfig()).toThrow(/local Supabase/i);
  });

  it("allows a non-local Supabase host outside development", () => {
    setEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    });
    expect(getSupabasePublicConfig().url).toBe("https://example.supabase.co");
  });
});
