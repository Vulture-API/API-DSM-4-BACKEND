import type {
  SensorTypeStatistics,
  StatisticsFilters,
} from "@/modules/statistics/types/statistics.type.js";

export interface StatisticsRepository {
  summarize(filters: StatisticsFilters): Promise<SensorTypeStatistics[]>;
  stationExists(stationId: number): Promise<boolean>;
}

/** Repositório em memória para os testes: devolve o que foi carregado. */
export class InMemoryStatisticsRepository implements StatisticsRepository {
  rows: SensorTypeStatistics[] = [];
  stationIds: number[] = [];
  lastFilters: StatisticsFilters | null = null;

  async summarize(filters: StatisticsFilters): Promise<SensorTypeStatistics[]> {
    this.lastFilters = filters;
    return this.rows;
  }

  async stationExists(stationId: number): Promise<boolean> {
    return this.stationIds.includes(stationId);
  }
}
