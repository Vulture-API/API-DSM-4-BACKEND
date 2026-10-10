import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("access-control environment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", undefined);
    vi.stubEnv("ACCESS_CONTROL_ENABLED", "false");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("keeps legacy mode available without a secret", async () => {
    const { env } = await import("@/config/environment.js");
    expect(env.ACCESS_CONTROL_ENABLED).toBe(false);
    expect(env.JWT_SECRET).toBeUndefined();
  });
  it("rejects enabled access control without a secret and rejects short secrets", async () => {
    vi.stubEnv("ACCESS_CONTROL_ENABLED", "true");
    await expect(import("@/config/environment.js")).rejects.toThrow(
      "JWT_SECRET",
    );
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "short");
    await expect(import("@/config/environment.js")).rejects.toThrow(
      "JWT_SECRET",
    );
  });
  it("accepts enabled access control with a configured secret", async () => {
    vi.stubEnv("ACCESS_CONTROL_ENABLED", "true");
    vi.stubEnv("JWT_SECRET", "test-secret-scrum-432-env-only-long");
    expect(
      (await import("@/config/environment.js")).env.ACCESS_CONTROL_ENABLED,
    ).toBe(true);
  });
});
