import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import type {
  ForecastDay,
  ForecastQuery,
} from "@/modules/forecast/types/forecast.type.js";

const DAILY_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "weather_code",
] as const;

type OpenMeteoDaily = { time?: string[] } & Partial<
  Record<(typeof DAILY_FIELDS)[number], Array<number | null>>
>;

export type OpenMeteoOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
};

/** Open-Meteo: gratuito, sem chave de API. https://open-meteo.com */
export class OpenMeteoProvider implements ForecastProvider {
  readonly source = "open-meteo";

  constructor(private readonly options: OpenMeteoOptions) {}

  async daily(query: ForecastQuery): Promise<ForecastDay[]> {
    const url = new URL(this.options.baseUrl);
    url.searchParams.set("latitude", String(query.latitude));
    url.searchParams.set("longitude", String(query.longitude));
    url.searchParams.set("daily", DAILY_FIELDS.join(","));
    url.searchParams.set("forecast_days", String(query.days));
    url.searchParams.set("timezone", "auto");

    const doFetch = this.options.fetch ?? fetch;
    const response = await doFetch(url, {
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo respondeu ${response.status}`);
    }

    const body = (await response.json()) as { daily?: OpenMeteoDaily };
    const daily = body.daily;
    if (!daily?.time) throw new Error("Open-Meteo sem dados diários");

    const at = (field: (typeof DAILY_FIELDS)[number], i: number) =>
      daily[field]?.at(i) ?? null;

    return daily.time.map((date, i) => ({
      date,
      temperature_max: at("temperature_2m_max", i),
      temperature_min: at("temperature_2m_min", i),
      precipitation_mm: at("precipitation_sum", i),
      precipitation_probability: at("precipitation_probability_max", i),
      wind_speed_max_kmh: at("wind_speed_10m_max", i),
      weather_code: at("weather_code", i),
    }));
  }
}
