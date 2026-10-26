import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckSensorLimitsService } from "@/modules/occurrences/services/check-sensor-limits.service.js";
import { DetectCommunicationFailuresService } from "@/modules/occurrences/services/detect-communication-failures.service.js";
import { OccurrenceMonitorWorker } from "@/modules/occurrences/services/occurrence-monitor.worker.js";
import { InMemoryOccurrenceRepository } from "@/modules/occurrences/testing/in-memory-occurrence.repository.js";

const build = (
  options: Partial<
    ConstructorParameters<typeof OccurrenceMonitorWorker>[2]
  > = {},
) => {
  const repository = new InMemoryOccurrenceRepository();
  const communication = new DetectCommunicationFailuresService(repository, 10);
  const limits = new CheckSensorLimitsService(repository);
  return {
    repository,
    communication,
    limits,
    worker: new OccurrenceMonitorWorker(communication, limits, {
      intervalMs: 1000,
      ...options,
    }),
  };
};

describe("OccurrenceMonitorWorker", () => {
  afterEach(() => vi.useRealTimers());

  it("roda as duas verificações e informa o ciclo", async () => {
    const onCycle = vi.fn();
    const { worker } = build({ onCycle });
    const result = await worker.runOnce();
    expect(result).toEqual({
      communication: {
        stations_checked: 0,
        failures_opened: 0,
        failures_resolved: 0,
      },
      limits: { readings_checked: 0, out_of_range: 0, last_reading_id: 0 },
    });
    expect(onCycle).toHaveBeenCalledWith(result);
  });

  it("devolve null com ciclo em andamento e repassa falhas", async () => {
    const onError = vi.fn();
    const { worker, communication } = build({ onError });
    let release!: () => void;
    vi.spyOn(communication, "execute").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              stations_checked: 0,
              failures_opened: 0,
              failures_resolved: 0,
            });
        }),
    );
    const first = worker.runOnce();
    expect(await worker.runOnce()).toBeNull();
    release();
    await first;

    vi.spyOn(communication, "execute").mockRejectedValueOnce(new Error("db"));
    await expect(worker.runOnce()).rejects.toThrow("db");
    expect(onError).toHaveBeenCalled();
  });

  it("agenda ciclos até parar", async () => {
    vi.useFakeTimers();
    const { worker, limits } = build();
    const spy = vi.spyOn(limits, "execute");
    worker.start();
    worker.start();
    expect(worker.isRunning).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    await worker.stop();
    expect(worker.isRunning).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("continua agendando depois de um ciclo com erro", async () => {
    vi.useFakeTimers();
    const { worker, communication } = build({ onError: () => undefined });
    const spy = vi
      .spyOn(communication, "execute")
      .mockRejectedValueOnce(new Error("db"));
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(spy).toHaveBeenCalledTimes(2);
    await worker.stop();
  });
});
