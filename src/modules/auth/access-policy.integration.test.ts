import { inspect } from "node:util";

import { describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import type { AccessPolicy } from "@/modules/auth/access-control.js";

describe("access policy registration", () => {
  it.each(
    [
      undefined,
      null,
      {},
      [],
      true,
      "public",
      { public: false },
      { always: false },
      { websocket: true },
      { public: true, permission: "users.read" },
      { public: true, always: true },
      { public: true, websocket: true },
      { permission: "unknown.permission" },
      { permission: "" },
      { permission: null },
      { permission: undefined, always: true },
      { permission: "users.read", always: "true" },
      { permission: "users.read", websocket: 1 },
      { permission: "users.read", typo: true },
    ].map((policy) => ({
      policy,
      label: inspect(policy, { breakLength: Infinity }),
    })),
  )(
    "rejects missing, empty, conflicting or invalid policies in either flag mode: $label",
    async ({ policy }) => {
      for (const enabled of [false, true]) {
        const app = buildApp({
          accessControlEnabled: enabled,
          jwtSecret: "scrum434-test-policy-registration-secret",
        });
        try {
          expect(() =>
            app.get(
              "/unclassified",
              { config: { access: policy as AccessPolicy } },
              async () => ({}),
            ),
          ).toThrow(/access policy for GET \/unclassified/);
        } finally {
          await app.close();
        }
      }
    },
  );

  it.each([
    { public: true },
    { always: true },
    { always: true, websocket: true },
    { permission: "users.read" },
    { permission: "users.read", always: true },
    { permission: "users.read", always: false, websocket: false },
    { permission: "monitoring.read", websocket: true },
  ] satisfies AccessPolicy[])(
    "accepts explicit public, authenticated and permission policies: %j",
    async (policy) => {
      const app = buildApp();
      try {
        expect(() =>
          app.get(
            "/classified",
            { config: { access: policy } },
            async () => ({}),
          ),
        ).not.toThrow();
        await app.ready();
      } finally {
        await app.close();
      }
    },
  );
});
