import { describe, expect, it } from "vitest";

import { hashPassword } from "@/modules/users/services/password-hasher.js";

describe("hashPassword", () => {
  it("creates distinct versioned hashes that fit the database column", async () => {
    const first = await hashPassword("password123");
    const second = await hashPassword("password123");

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(second).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(255);
  });
});
