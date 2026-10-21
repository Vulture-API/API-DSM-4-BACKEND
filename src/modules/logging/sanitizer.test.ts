import { describe, expect, it } from "vitest";

import {
  isSensitiveKey,
  sanitizeHeaders,
  sanitizeLogData,
} from "./sanitizer.js";

describe("sanitizer", () => {
  describe("isSensitiveKey", () => {
    it("identifica chaves sensíveis comuns", () => {
      expect(isSensitiveKey("password")).toBe(true);
      expect(isSensitiveKey("current_password")).toBe(true);
      expect(isSensitiveKey("userSenha")).toBe(true);
      expect(isSensitiveKey("access_token")).toBe(true);
      expect(isSensitiveKey("JWT_SECRET")).toBe(true);
      expect(isSensitiveKey("Authorization")).toBe(true);
      expect(isSensitiveKey("cookie")).toBe(true);
      expect(isSensitiveKey("apiKey")).toBe(true);
      expect(isSensitiveKey("api_key")).toBe(true);
      expect(isSensitiveKey("client_secret")).toBe(true);
    });

    it("retorna false para chaves não sensíveis", () => {
      expect(isSensitiveKey("id")).toBe(false);
      expect(isSensitiveKey("email")).toBe(false);
      expect(isSensitiveKey("name")).toBe(false);
      expect(isSensitiveKey("status")).toBe(false);
      expect(isSensitiveKey("createdAt")).toBe(false);
    });
  });

  describe("sanitizeLogData", () => {
    it("mantém primitivos, nulos e indefinidos", () => {
      expect(sanitizeLogData(null)).toBeNull();
      expect(sanitizeLogData(undefined)).toBeUndefined();
      expect(sanitizeLogData(123)).toBe(123);
      expect(sanitizeLogData("normal string")).toBe("normal string");
      expect(sanitizeLogData(true)).toBe(true);
    });

    it("mascara campos sensíveis em objetos simples", () => {
      const data = {
        name: "Admin User",
        email: "admin@vulture.com",
        password: "supersecret123",
        token: "jwt.token.value",
        secret: "my_env_secret",
      };

      const sanitized = sanitizeLogData(data);
      expect(sanitized).toEqual({
        name: "Admin User",
        email: "admin@vulture.com",
        password: "[REDACTED]",
        token: "[REDACTED]",
        secret: "[REDACTED]",
      });
    });

    it("mascara recursivamente em objetos aninhados e arrays", () => {
      const nested = {
        user: {
          id: 1,
          credentials: {
            token: "secret",
          },
          profile: {
            password: "p1",
            apiKey: "k1",
          },
        },
        sessions: [
          { token: "tok1", ip: "127.0.0.1" },
          { token: "tok2", ip: "192.168.0.1" },
        ],
      };

      const sanitized = sanitizeLogData(nested);
      expect(sanitized.user.credentials).toBe("[REDACTED]");
      expect(sanitized.user.profile.password).toBe("[REDACTED]");
      expect(sanitized.user.profile.apiKey).toBe("[REDACTED]");
      expect(sanitized.user.id).toBe(1);
      expect(sanitized.sessions[0]?.token).toBe("[REDACTED]");
      expect(sanitized.sessions[0]?.ip).toBe("127.0.0.1");
      expect(sanitized.sessions[1]?.token).toBe("[REDACTED]");
    });

    it("mascara campos em instâncias de Error sem perder nome, mensagem e stack", () => {
      const error = new Error("Database connection failed");
      (error as unknown as Record<string, unknown>).password = "secret_db_pass";
      (error as unknown as Record<string, unknown>).safeField = "safe_val";

      const sanitized = sanitizeLogData(error);
      expect(sanitized.name).toBe("Error");
      expect(sanitized.message).toBe("Database connection failed");
      expect(sanitized.stack).toBeDefined();
      const sanitizedRecord = sanitized as unknown as Record<string, unknown>;
      expect(sanitizedRecord.password).toBe("[REDACTED]");
      expect(sanitizedRecord.safeField).toBe("safe_val");
    });

    it("lida com referências circulares com segurança", () => {
      const circular: Record<string, unknown> = { name: "cycle" };
      circular.self = circular;

      const sanitized = sanitizeLogData(circular);
      expect(sanitized.name).toBe("cycle");
      expect(sanitized.self).toBe("[CIRCULAR]");
    });
  });

  describe("sanitizeHeaders", () => {
    it("mascara cabeçalhos de autenticação e cookies", () => {
      const headers = {
        authorization: "Bearer secret-token-12345",
        cookie: "session_id=abcde123",
        "set-cookie": "token=def456",
        "x-api-key": "api-key-999",
        "content-type": "application/json",
        "user-agent": "Vitest/1.0",
      };

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized.authorization).toBe("[REDACTED]");
      expect(sanitized.cookie).toBe("[REDACTED]");
      expect(sanitized["set-cookie"]).toBe("[REDACTED]");
      expect(sanitized["x-api-key"]).toBe("[REDACTED]");
      expect(sanitized["content-type"]).toBe("application/json");
      expect(sanitized["user-agent"]).toBe("Vitest/1.0");
    });

    it("retorna objeto vazio se headers for undefined", () => {
      expect(sanitizeHeaders(undefined)).toEqual({});
    });
  });
});
