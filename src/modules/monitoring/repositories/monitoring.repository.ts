import type {
  SensorTypeSeries,
  SeriesFilters,
  StationSnapshot,
} from "@/modules/monitoring/types/monitoring.type.js";

export interface MonitoringRepository {
  listSnapshots(propertyId?: number): Promise<StationSnapshot[]>;
  readingSeries(filters: SeriesFilters): Promise<SensorTypeSeries[]>;
  stationExists(stationId: number): Promise<boolean>;
}

/** Repositório em memória para os testes: devolve o que foi carregado. */
export class InMemoryMonitoringRepository implements MonitoringRepository {
  snapshots: StationSnapshot[] = [];
  series: SensorTypeSeries[] = [];
  lastSeriesFilters: SeriesFilters | null = null;

  async listSnapshots(propertyId?: number): Promise<StationSnapshot[]> {
    return this.snapshots.filter(
      (s) => propertyId === undefined || s.property_id === propertyId,
    );
  }

  async readingSeries(filters: SeriesFilters): Promise<SensorTypeSeries[]> {
    this.lastSeriesFilters = filters;
    return this.series;
  }

  async stationExists(stationId: number): Promise<boolean> {
    return this.snapshots.some((s) => s.id === stationId);
  }
}
