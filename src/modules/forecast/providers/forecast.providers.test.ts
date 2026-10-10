import { describe, expect, it, vi } from "vitest";

import { ForecastProviderError } from "@/modules/forecast/errors/forecast.errors.js";
import { CachedForecastProvider } from "@/modules/forecast/providers/cached-forecast.provider.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import { OpenMeteoProvider } from "@/modules/forecast/providers/open-meteo.provider.js";
import type { ForecastDay } from "@/modules/forecast/types/forecast.type.js";

const query = { latitude: -23.18, longitude: -45.88, days: 2 };
const BASE_URL = "https://api.open-meteo.com/v1/forecast";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const daily = {
  time: ["2026-10-08", "2026-10-09"],
  temperature_2m_max: [29.1, 31.4],
  temperature_2m_min: [16.2, 17],
  precipitation_sum: [0, 4.2],
  precipitation_probability_max: [10, null],
  wind_speed_10m_max: [12.5, 18],
  weather_code: [1, 61],
};

function provider(fetchImpl: typeof fetch, timeoutMs = 1000) {
  return new OpenMeteoProvider({
    baseUrl: BASE_URL,
    timeoutMs,
    fetch: fetchImpl,
  });
}

describe("OpenMeteoProvider", () => {
  it("monta a consulta e converte os dados diários", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo) =>
      jsonResponse({ daily }),
    );

    const days = await provider(fetchMock).daily(query);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get("latitude")).toBe("-23.18");
    expect(url.searchParams.get("longitude")).toBe("-45.88");
    expect(url.searchParams.get("forecast_days")).toBe("2");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("daily")).toContain("temperature_2m_max");
    expect(days).toEqual([
      {
        date: "2026-10-08",
        temperature_max: 29.1,
        temperature_min: 16.2,
        precipitation_mm: 0,
        precipitation_probability: 10,
        wind_speed_max_kmh: 12.5,
        weather_code: 1,
      },
      {
        date: "2026-10-09",
        temperature_max: 31.4,
        temperature_min: 17,
        precipitation_mm: 4.2,
        precipitation_probability: null,
        wind_speed_max_kmh: 18,
        weather_code: 61,
      },
    ]);
  });

  it("não segue redirecionamentos", async () => {
    const fetchMock = vi.fn(
      async (_url: URL | RequestInfo, _init?: RequestInit) =>
        jsonResponse({ daily }),
    );

    await provider(fetchMock).daily(query);

    expect(fetchMock.mock.calls[0]![1]?.redirect).toBe("error");
  });

  it("falha com o motivo quando o provedor responde erro", async () => {
    const failing = provider(async () =>
      jsonResponse({ error: true, reason: "Latitude inválida" }, 400),
    );

    const error = await failing.daily(query).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForecastProviderError);
    expect((error as Error).message).toContain("400");
    expect((error as Error).message).toContain("Latitude inválida");
  });

  it.each([
    ["sem dados diários", {}],
    ["sem dias", { daily: { ...daily, time: [] } }],
    ["campo ausente", { daily: { ...daily, weather_code: undefined } }],
    [
      "valor não numérico",
      { daily: { ...daily, temperature_2m_max: ["29", 31] } },
    ],
    [
      "séries de tamanhos diferentes",
      { daily: { ...daily, weather_code: [1] } },
    ],
  ])("recusa resposta fora do formato: %s", async (_case, body) => {
    await expect(
      provider(async () => jsonResponse(body)).daily(query),
    ).rejects.toBeInstanceOf(ForecastProviderError);
  });

  it("converte falha de rede em erro do provedor", async () => {
    const error = await provider(async () => {
      throw new TypeError("fetch failed");
    })
      .daily(query)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForecastProviderError);
    expect((error as Error).cause).toBeInstanceOf(TypeError);
  });

  it("aborta a chamada no timeout", async () => {
    const hanging = provider(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
      10,
    );

    const error = await hanging.daily(query).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForecastProviderError);
    expect(((error as Error).cause as Error).name).toBe("TimeoutError");
  });
});

describe("CachedForecastProvider", () => {
  const week: ForecastDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${String(8 + i).padStart(2, "0")}`,
    temperature_max: 29,
    temperature_min: 16,
    precipitation_mm: 0,
    precipitation_probability: 10,
    wind_speed_max_kmh: 12,
    weather_code: 1,
  }));

  const fakeInner = () => {
    const daily = vi.fn(async () => week);
    const inner: ForecastProvider = { source: "fake", daily };
    return { inner, daily };
  };

  it("busca 7 dias uma vez por posição e devolve só os dias pedidos", async () => {
    const { inner, daily } = fakeInner();
    const cached = new CachedForecastProvider(inner, { ttlMs: 60_000 });

    expect(await cached.daily({ ...query, days: 2 })).toHaveLength(2);
    expect(await cached.daily({ ...query, days: 7 })).toHaveLength(7);
    await cached.daily({ ...query, latitude: -23.1801 });

    expect(daily).toHaveBeenCalledTimes(1);
    expect(daily).toHaveBeenCalledWith({ ...query, days: 7 });
    expect(cached.source).toBe("fake");
  });

  it("expira exatamente no fim do TTL", async () => {
    let now = Date.parse("2026-10-08T12:00:00.000Z");
    const { inner, daily } = fakeInner();
    const cached = new CachedForecastProvider(inner, {
      ttlMs: 60_000,
      clock: () => new Date(now),
    });

    await cached.daily(query);
    now += 59_999;
    await cached.daily(query);
    expect(daily).toHaveBeenCalledTimes(1);

    now += 1;
    await cached.daily(query);
    expect(daily).toHaveBeenCalledTimes(2);
  });

  it("chamadas simultâneas para a mesma posição fazem uma consulta só", async () => {
    let release: (days: ForecastDay[]) => void = () => undefined;
    const daily = vi.fn(
      () => new Promise<ForecastDay[]>((resolve) => (release = resolve)),
    );
    const cached = new CachedForecastProvider(
      { source: "fake", daily },
      { ttlMs: 60_000 },
    );

    const both = Promise.all([cached.daily(query), cached.daily(query)]);
    release(week);

    expect((await both).map((d) => d.length)).toEqual([2, 2]);
    expect(daily).toHaveBeenCalledTimes(1);
  });

  it("não guarda falhas do provedor", async () => {
    const daily = vi
      .fn<ForecastProvider["daily"]>()
      .mockRejectedValueOnce(new ForecastProviderError("fora do ar"))
      .mockResolvedValue(week);
    const cached = new CachedForecastProvider(
      { source: "fake", daily },
      { ttlMs: 60_000 },
    );

    await expect(cached.daily(query)).rejects.toThrow("fora do ar");
    await expect(cached.daily(query)).resolves.toHaveLength(2);
    expect(cached.size).toBe(1);
  });

  it("com TTL zero não guarda nada", async () => {
    const { inner, daily } = fakeInner();
    const cached = new CachedForecastProvider(inner, { ttlMs: 0 });

    await cached.daily(query);
    await cached.daily(query);

    expect(daily).toHaveBeenCalledTimes(2);
    expect(cached.size).toBe(0);
  });

  it("limita a quantidade de posições guardadas", async () => {
    const { inner } = fakeInner();
    const cached = new CachedForecastProvider(inner, {
      ttlMs: 60_000,
      maxEntries: 3,
    });

    for (let i = 0; i < 10; i++) {
      await cached.daily({ ...query, latitude: -23 + i });
    }

    expect(cached.size).toBe(3);
  });

  it("devolve dados que o chamador não consegue alterar", async () => {
    const { inner } = fakeInner();
    const cached = new CachedForecastProvider(inner, { ttlMs: 60_000 });

    const first = await cached.daily(query);
    expect(() => {
      (first[0] as { temperature_max: number }).temperature_max = 99;
    }).toThrow();
    expect((await cached.daily(query))[0]!.temperature_max).toBe(29);
  });
});
