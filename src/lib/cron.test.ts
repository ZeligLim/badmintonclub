import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron";

describe("cron authorisation", () => {
  it("accepts the bearer token Vercel sends", () => {
    expect(isAuthorizedCronRequest("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a missing, wrong or differently cased token", () => {
    expect(isAuthorizedCronRequest(null, "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("bearer s3cret", "s3cret")).toBe(false);
    expect(isAuthorizedCronRequest("s3cret", "s3cret")).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});
