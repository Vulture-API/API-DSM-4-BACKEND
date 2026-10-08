import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import type {
  ForecastDay,
  ForecastQuery,
} from "@/modules/forecast/types/forecast.type.js";

type Clock = () => Date;

/**
 * Guarda a previsão por coordenada (2 casas, ~1 km) e quantidade de dias.
 * A previsão muda poucas vezes por hora, e o provedor tem limite diário.
 */
export class CachedForecastProvider implements ForecastProvider {
  private readonly entries = new Map<
    string,
    { expiresAt: number; days: ForecastDay[] }
  >();

  constructor(
    private readonly inner: ForecastProvider,
    private readonly ttlMs: number,
    private readonly clock: Clock = () => new Date(),
  ) {}

  get source(): string {
    return this.inner.source;
  }

  async daily(query: ForecastQuery): Promise<ForecastDay[]> {
    const key = `${query.latitude.toFixed(2)},${query.longitude.toFixed(2)},${query.days}`;
    const now = this.clock().getTime();
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > now) return cached.days;

    const days = await this.inner.daily(query);
    this.entries.set(key, { expiresAt: now + this.ttlMs, days });
    return days;
  }
}
