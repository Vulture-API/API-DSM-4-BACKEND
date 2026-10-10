import type { FastifyInstance } from "fastify";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import {
  hashPassword,
  verifyPassword,
} from "@/modules/users/services/password-hasher.js";

const secret = "test-secret-for-scrum-432-not-for-production";
let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword("password123");
});

describe("JWT authentication", () => {
  let app: FastifyInstance;
  let repository: FakeAuthRepository;
  beforeEach(async () => {
    repository = new FakeAuthRepository();
    repository.credentials.push({
      id: 1,
      role_id: 2,
      name: "Test",
      email: "test@example.com",
      active: true,
      created_at: "2026-10-10T00:00:00.000Z",
      password_hash: passwordHash,
      permissions: ["monitoring.read"],
    });
    app = buildApp({ jwtSecret: secret, authRepository: repository });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  async function login() {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "  TEST@example.com  ", password: "password123" },
    });
  }

  it("logs in, issues a scoped WebSocket cookie and returns the current user without hashes", async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    const payload = app.jwt.decode<{
      sub: string;
      iss: string;
      aud: string;
      iat: number;
      exp: number;
    }>(result.access_token)!;
    expect(payload).toMatchObject({
      sub: "1",
      iss: "agritech-backend",
      aud: "agritech-api",
    });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(payload).not.toHaveProperty("permissions");
    expect(response.headers["set-cookie"]).toContain(
      "Path=/api/stations/current/ws",
    );
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["cache-control"]).toBe("no-store");
    const me = await app.inject({
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${result.access_token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      id: 1,
      role_id: 2,
      permissions: ["monitoring.read"],
    });
    expect(me.json()).not.toHaveProperty("password_hash");
  });

  it("reads current grants and rejects inactive or deleted users with an existing token", async () => {
    const response = await login();
    const headers = { authorization: `Bearer ${response.json().access_token}` };
    repository.credentials[0]!.role_id = 3;
    repository.credentials[0]!.permissions = [];
    expect(
      (await app.inject({ url: "/api/auth/me", headers })).json(),
    ).toMatchObject({ role_id: 3, permissions: [] });
    repository.credentials[0]!.active = false;
    expect(
      (await app.inject({ url: "/api/auth/me", headers })).statusCode,
    ).toBe(401);
    repository.credentials = [];
    expect(
      (await app.inject({ url: "/api/auth/me", headers })).statusCode,
    ).toBe(401);
  });

  it.each(["wrong password", "unknown email", "inactive", "invalid hash"])(
    "returns the same 401 for %s",
    async (kind) => {
      const payload = { email: "test@example.com", password: "password123" };
      if (kind === "wrong password") payload.password = "wrong";
      if (kind === "unknown email") payload.email = "unknown@example.com";
      if (kind === "inactive") repository.credentials[0]!.active = false;
      if (kind === "invalid hash")
        repository.credentials[0]!.password_hash = "invalid";
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        code: 401,
        message: "Invalid credentials or authentication token.",
        details: [],
      });
    },
  );

  it("rejects missing, malformed, expired, foreign and tampered tokens, and does not accept cookies on REST", async () => {
    const valid = app.jwt.sign({ sub: "1" });
    const tokens = [
      "Bearer",
      "Basic abc",
      "Bearer fake",
      `Bearer ${valid.slice(0, -8)}tampered`,
      `Bearer ${app.jwt.sign({ sub: "1" }, { expiresIn: -1 })}`,
      `Bearer ${app.jwt.sign({ sub: "1" }, { iss: "other" })}`,
      `Bearer ${app.jwt.sign({ sub: "1" }, { aud: "other" })}`,
      `Bearer ${app.jwt.sign({ sub: "1" }, { algorithm: "HS384" })}`,
      `Bearer ${app.jwt.sign({ sub: "0" })}`,
      `Bearer ${app.jwt.sign({ sub: "2147483648" })}`,
      `Bearer ${app.jwt.sign({ sub: 1 })}`,
    ];
    expect((await app.inject({ url: "/api/auth/me" })).statusCode).toBe(401);
    for (const authorization of tokens) {
      expect(
        (await app.inject({ url: "/api/auth/me", headers: { authorization } }))
          .statusCode,
      ).toBe(401);
    }
    expect(
      (
        await app.inject({
          url: "/api/auth/me",
          headers: { cookie: `agritech_ws_token=${valid}` },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("propagates database failures as 500", async () => {
    vi.spyOn(repository, "findUserById").mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    const response = await app.inject({
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` },
    });
    expect(response.statusCode).toBe(500);
  });

  it("validates login inputs", async () => {
    for (const payload of [
      {},
      { email: "invalid", password: "test" },
      { email: "test@example.com", password: "" },
    ]) {
      expect(
        (await app.inject({ method: "POST", url: "/api/auth/login", payload }))
          .statusCode,
      ).toBe(400);
    }
  });
});

describe("auth configuration and password compatibility", () => {
  it("returns 503 without a secret while preserving public healthchecks", async () => {
    const app = buildApp();
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: "test@example.com", password: "test" },
          })
        ).statusCode,
      ).toBe(503);
      expect((await app.inject({ url: "/api/auth/me" })).statusCode).toBe(503);
      expect((await app.inject({ url: "/health" })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
  it("refuses enabled protection without a valid secret", () => {
    expect(() => buildApp({ accessControlEnabled: true })).toThrow(
      "JWT_SECRET",
    );
    expect(() => buildApp({ jwtSecret: "short" })).toThrow("JWT_SECRET");
  });
  it("verifies existing scrypt hashes and rejects malformed parameters", async () => {
    expect(await verifyPassword("password123", passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", passwordHash)).toBe(false);
    for (const invalid of [
      "",
      passwordHash.replace("16384", "1048576"),
      passwordHash.replace("$8$", "$9$"),
      passwordHash.replace("$1$", "$2$"),
      passwordHash.replace("scrypt", "other"),
      passwordHash + "$extra",
      "scrypt$16384$8$1$xx$" + "aa".repeat(64),
    ]) {
      expect(await verifyPassword("test", invalid)).toBe(false);
    }
  });
});
