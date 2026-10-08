import { describe, expect, it, vi } from "vitest";

import { CachedForecastProvider } from "@/modules/forecast/providers/cached-forecast.provider.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import { OpenMeteoProvider } from "@/modules/forecast/providers/open-meteo.provider.js";

const query = { latitude: -23.18, longitude: -45.88, days: 2 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenMeteoProvider", () => {
  it("monta a consulta e converte os dados diários", async () => {
    const fetchMock = vi.fn(async (_url: URL | RequestInfo) =>
      jsonResponse({
        daily: {
          time: ["2026-10-08", "2026-10-09"],
          temperature_2m_max: [29.1, 31.4],
          temperature_2m_min: [16.2, 17],
          precipitation_sum: [0, 4.2],
          precipitation_probability_max: [10, 70],
          wind_speed_10m_max: [12.5, 18],
          weather_code: [1, 61],
        },
      }),
    );
    const provider = new OpenMeteoProvider({
      baseUrl: "https://api.open-meteo.com/v1/forecast",
      timeoutMs: 1000,
      fetch: fetchMock,
    });

    const days = await provider.daily(query);

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get("latitude")).toBe("-23.18");
    expect(url.searchParams.get("longitude")).toBe("-45.88");
    expect(url.searchParams.get("forecast_days")).toBe("2");
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
        precipitation_probability: 70,
        wind_speed_max_kmh: 18,
        weather_code: 61,
      },
    ]);
  });

  it("preenche com null os campos que o provedor não mandou", async () => {
    const provider = new OpenMeteoProvider({
      baseUrl: "https://api.open-meteo.com/v1/forecast",
      timeoutMs: 1000,
      fetch: async () => jsonResponse({ daily: { time: ["2026-10-08"] } }),
    });

    const [day] = await provider.daily({ ...query, days: 1 });

    expect(day).toMatchObject({ date: "2026-10-08", temperature_max: null });
  });

  it("falha com resposta de erro ou sem dados diários", async () => {
    const failing = new OpenMeteoProvider({
      baseUrl: "https://api.open-meteo.com/v1/forecast",
      timeoutMs: 1000,
      fetch: async () => jsonResponse({ reason: "limite" }, 429),
    });
    await expect(failing.daily(query)).rejects.toThrow("429");

    const empty = new OpenMeteoProvider({
      baseUrl: "https://api.open-meteo.com/v1/forecast",
      timeoutMs: 1000,
      fetch: async () => jsonResponse({}),
    });
    await expect(empty.daily(query)).rejects.toThrow("sem dados");
  });

  it("aborta a chamada no timeout", async () => {
    const provider = new OpenMeteoProvider({
      baseUrl: "https://api.open-meteo.com/v1/forecast",
      timeoutMs: 10,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    });

    await expect(provider.daily(query)).rejects.toThrow();
  });
});

describe("CachedForecastProvider", () => {
  const day = {
    date: "2026-10-08",
    temperature_max: 29,
    temperature_min: 16,
    precipitation_mm: 0,
    precipitation_probability: 10,
    wind_speed_max_kmh: 12,
    weather_code: 1,
  };

  it("reaproveita a previsão até expirar", async () => {
    let now = Date.parse("2026-10-08T12:00:00.000Z");
    const inner: ForecastProvider = {
      source: "fake",
      daily: vi.fn(async () => [day]),
    };
    const cached = new CachedForecastProvider(
      inner,
      60_000,
      () => new Date(now),
    );

    await cached.daily(query);
    await cached.daily({ ...query, latitude: -23.1801 });
    expect(inner.daily).toHaveBeenCalledTimes(1);
    expect(cached.source).toBe("fake");

    await cached.daily({ ...query, days: 3 });
    expect(inner.daily).toHaveBeenCalledTimes(2);

    now += 60_001;
    await cached.daily(query);
    expect(inner.daily).toHaveBeenCalledTimes(3);
  });

  it("não guarda falhas do provedor", async () => {
    const inner: ForecastProvider = {
      source: "fake",
      daily: vi
        .fn()
        .mockRejectedValueOnce(new Error("fora do ar"))
        .mockResolvedValue([day]),
    };
    const cached = new CachedForecastProvider(inner, 60_000);

    await expect(cached.daily(query)).rejects.toThrow("fora do ar");
    await expect(cached.daily(query)).resolves.toEqual([day]);
  });
});
