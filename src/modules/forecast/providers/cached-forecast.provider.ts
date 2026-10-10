import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import type {
  ForecastDay,
  ForecastQuery,
} from "@/modules/forecast/types/forecast.type.js";

type Clock = () => Date;

export const FORECAST_MAX_DAYS = 7;

type Entry = { expiresAt: number; days: Promise<readonly ForecastDay[]> };

export type CachedForecastOptions = {
  ttlMs: number;
  maxEntries?: number;
  clock?: Clock;
};

/**
 * Guarda a previsão de 7 dias por coordenada (2 casas, ~1 km) e devolve só
 * os dias pedidos. Chamadas simultâneas para a mesma posição compartilham
 * a mesma consulta ao provedor; falhas não ficam guardadas.
 */
export class CachedForecastProvider implements ForecastProvider {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly clock: Clock;

  constructor(
    private readonly inner: ForecastProvider,
    private readonly options: CachedForecastOptions,
  ) {
    this.maxEntries = options.maxEntries ?? 500;
    this.clock = options.clock ?? (() => new Date());
  }

  get source(): string {
    return this.inner.source;
  }

  get size(): number {
    return this.entries.size;
  }

  async daily(query: ForecastQuery): Promise<ForecastDay[]> {
    const days = await this.week(query.latitude, query.longitude);
    return days.slice(0, query.days);
  }

  private week(
    latitude: number,
    longitude: number,
  ): Promise<readonly ForecastDay[]> {
    const fetchWeek = () =>
      this.inner
        .daily({ latitude, longitude, days: FORECAST_MAX_DAYS })
        .then((days) => Object.freeze(days.map((d) => Object.freeze(d))));

    if (this.options.ttlMs <= 0) return fetchWeek();

    const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    const now = this.clock().getTime();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.days;

    const days = fetchWeek();
    this.entries.delete(key);
    this.entries.set(key, { expiresAt: now + this.options.ttlMs, days });
    days.catch(() => {
      if (this.entries.get(key)?.days === days) this.entries.delete(key);
    });
    this.evict(now);
    return days;
  }

  private evict(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
