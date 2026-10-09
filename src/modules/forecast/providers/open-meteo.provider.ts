import z from "zod";

import { ForecastProviderError } from "@/modules/forecast/errors/forecast.errors.js";
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

const series = z.array(z.number().nullable());

const responseSchema = z.object({
  daily: z.object({
    time: z.array(z.iso.date()).min(1),
    temperature_2m_max: series,
    temperature_2m_min: series,
    precipitation_sum: series,
    precipitation_probability_max: series,
    wind_speed_10m_max: series,
    weather_code: series,
  }),
});

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
    let body: unknown;
    try {
      const response = await doFetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      if (!response.ok) {
        const reason = await response.text().catch(() => "");
        throw new ForecastProviderError(
          `Open-Meteo respondeu ${response.status}: ${reason.slice(0, 200)}`,
        );
      }
      body = await response.json();
    } catch (error) {
      if (error instanceof ForecastProviderError) throw error;
      throw new ForecastProviderError("Falha ao chamar o Open-Meteo", {
        cause: error,
      });
    }

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ForecastProviderError(
        "Resposta do Open-Meteo fora do formato",
        {
          cause: parsed.error,
        },
      );
    }
    const daily = parsed.data.daily;
    const length = daily.time.length;
    if (DAILY_FIELDS.some((field) => daily[field].length !== length)) {
      throw new ForecastProviderError(
        "Resposta do Open-Meteo com séries de tamanhos diferentes",
      );
    }

    return daily.time.map((date, i) => ({
      date,
      temperature_max: daily.temperature_2m_max.at(i) ?? null,
      temperature_min: daily.temperature_2m_min.at(i) ?? null,
      precipitation_mm: daily.precipitation_sum.at(i) ?? null,
      precipitation_probability:
        daily.precipitation_probability_max.at(i) ?? null,
      wind_speed_max_kmh: daily.wind_speed_10m_max.at(i) ?? null,
      weather_code: daily.weather_code.at(i) ?? null,
    }));
  }
}
