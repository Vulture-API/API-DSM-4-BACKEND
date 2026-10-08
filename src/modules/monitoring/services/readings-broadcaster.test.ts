import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";
import type { LiveReading } from "@/modules/monitoring/types/monitoring.type.js";

function reading(id: number, stationId = 1): LiveReading {
  return {
    reading_id: id,
    station_id: stationId,
    sensor_id: 10,
    local_identifier: "temp",
    sensor_type_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "°C",
    value: 20 + id,
    unix_time: 1_790_000_000 + id,
  };
}

describe("ReadingsBroadcaster", () => {
  let repository: InMemoryMonitoringRepository;
  let broadcaster: ReadingsBroadcaster;

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new InMemoryMonitoringRepository();
    repository.liveReadings = [reading(1), reading(2)];
    broadcaster = new ReadingsBroadcaster(repository, { intervalMs: 1000 });
  });

  afterEach(async () => {
    await broadcaster.close();
    vi.useRealTimers();
  });

  it("parte do último id e envia só as leituras novas", async () => {
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(3), reading(4));
    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toEqual([3, 4]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([3, 4]);
  });

  it("respeita o tamanho do lote", async () => {
    broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      batchSize: 1,
    });
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(3), reading(4));
    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([3]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([3, 4]);
  });

  it("para de consultar quando o último inscrito sai", async () => {
    const spy = vi.spyOn(repository, "readingsAfter");
    const unsubscribe = broadcaster.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcaster.isPolling).toBe(true);

    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);
    const calls = spy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    expect(broadcaster.subscribers).toBe(0);
    expect(broadcaster.isPolling).toBe(false);
    expect(spy.mock.calls.length).toBe(calls);
  });

  it("recomeça do último id ao conectar de novo", async () => {
    const unsubscribe = broadcaster.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(3));
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(2000);

    expect(received).toEqual([]);
  });

  it("segue consultando após falha do banco ou de um inscrito", async () => {
    const onError = vi.fn();
    broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      onError,
    });
    const received: number[] = [];
    broadcaster.subscribe(() => {
      throw new Error("socket fechado");
    });
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    vi.spyOn(repository, "readingsAfter").mockRejectedValueOnce(
      new Error("conexão perdida"),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);

    repository.liveReadings.push(reading(3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([3]);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("não volta a consultar depois de fechado", async () => {
    await broadcaster.close();
    broadcaster.subscribe(() => undefined);

    expect(broadcaster.isPolling).toBe(false);
  });
});
