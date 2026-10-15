import type {
  ForecastDay,
  ForecastQuery,
} from "@/modules/forecast/types/forecast.type.js";

export interface ForecastProvider {
  readonly source: string;
  daily(query: ForecastQuery): Promise<ForecastDay[]>;
}
