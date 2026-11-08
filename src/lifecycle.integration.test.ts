import { describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { createShutdown } from "@/lifecycle.js";
import type { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

describe("encerramento do monolito", () => {
  it("drena HTTP e aguarda o motor antes de fechar o pool, uma única vez", async () => {
    const events: string[] = [];
    let release!: () => void;
    const stopping = new Promise<void>((resolve) => {
      release = resolve;
    });
    const worker = {
      stop: vi.fn(async () => {
        events.push("motor");
        await stopping;
      }),
    } as unknown as RulesEngineWorker;
    const app = buildApp({ rulesEngineWorker: worker });
    await app.ready();
    const pool = {
      end: vi.fn(async () => {
        events.push("pool");
      }),
    };
    const shutdown = createShutdown(app, pool);
    const first = shutdown();
    expect(shutdown()).toBe(first);
    await vi.waitFor(() => expect(events).toEqual(["motor"]));
    expect(pool.end).not.toHaveBeenCalled();
    release();
    await first;
    expect(events).toEqual(["motor", "pool"]);
    expect(worker.stop).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("fecha o pool mesmo quando o fechamento HTTP falha", async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    const shutdown = createShutdown(
      { close: vi.fn().mockRejectedValue(new Error("close failed")) },
      pool,
    );
    await expect(shutdown()).rejects.toThrow("close failed");
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
