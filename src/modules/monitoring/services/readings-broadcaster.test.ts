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

  it("consulta no máximo o tamanho do lote por vez", async () => {
    broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      batchSize: 1,
    });
    const spy = vi.spyOn(repository, "readingsAfter");
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(3), reading(4));
    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toEqual([3, 4]);
    expect(spy.mock.calls.every(([, limit]) => limit === 1)).toBe(true);
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

    repository.liveReadings.push(reading(4));
    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([4]);
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
    const spy = vi.spyOn(repository, "lastReadingId");
    await broadcaster.close();
    broadcaster.subscribe(() => undefined);
    await vi.advanceTimersByTimeAsync(5000);

    expect(broadcaster.isPolling).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("ReadingsBroadcaster (atraso, erros e mensagem)", () => {
  let repository: InMemoryMonitoringRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    repository = new InMemoryMonitoringRepository();
    repository.liveReadings = [reading(1)];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drena o atraso sem esperar quando o lote vem cheio", async () => {
    const broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      batchSize: 2,
    });
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(
      reading(2),
      reading(3),
      reading(4),
      reading(5),
    );
    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toEqual([2, 3, 4, 5]);
    await broadcaster.close();
  });

  it("serializa a leitura uma vez e entrega a todos os inscritos", async () => {
    const broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
    });
    const first: string[] = [];
    const second: string[] = [];
    broadcaster.subscribe((_r, message) => first.push(message));
    broadcaster.subscribe((_r, message) => second.push(message));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(2, 7));
    await vi.advanceTimersByTimeAsync(1000);

    expect(first).toEqual(second);
    expect(JSON.parse(first[0]!)).toEqual({
      type: "reading",
      ...reading(2, 7),
    });
    await broadcaster.close();
  });

  it("continua consultando mesmo se o onError lançar", async () => {
    const broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      onError: () => {
        throw new Error("log quebrado");
      },
    });
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    vi.spyOn(repository, "readingsAfter").mockRejectedValueOnce(
      new Error("conexão perdida"),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcaster.isPolling).toBe(true);

    repository.liveReadings.push(reading(2));
    await vi.advanceTimersByTimeAsync(1000);
    expect(received).toEqual([2]);
    await broadcaster.close();
  });

  it("tenta de novo quando a leitura do último id falha", async () => {
    const onError = vi.fn();
    const broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
      onError,
    });
    vi.spyOn(repository, "lastReadingId").mockRejectedValueOnce(
      new Error("fora do ar"),
    );
    const received: number[] = [];
    broadcaster.subscribe((r) => received.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    repository.liveReadings.push(reading(2));
    await vi.advanceTimersByTimeAsync(1000);

    expect(received).toEqual([2]);
    await broadcaster.close();
  });

  it("um novo inscrito não recebe leituras anteriores à inscrição", async () => {
    const broadcaster = new ReadingsBroadcaster(repository, {
      intervalMs: 1000,
    });
    const first: number[] = [];
    broadcaster.subscribe((r) => first.push(r.reading_id));
    await vi.advanceTimersByTimeAsync(0);

    repository.liveReadings.push(reading(2));
    await vi.advanceTimersByTimeAsync(1000);

    const late: number[] = [];
    broadcaster.subscribe((r) => late.push(r.reading_id));
    repository.liveReadings.push(reading(3));
    await vi.advanceTimersByTimeAsync(1000);

    expect(first).toEqual([2, 3]);
    expect(late).toEqual([3]);
    await broadcaster.close();
  });
});
