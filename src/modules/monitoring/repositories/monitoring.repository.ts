import type {
  CurrentFilters,
  LiveReading,
  SensorTypeSeries,
  SeriesFilters,
  StationCurrentRow,
  StationSnapshot,
} from "@/modules/monitoring/types/monitoring.type.js";

export interface MonitoringRepository {
  listSnapshots(propertyId?: number): Promise<StationSnapshot[]>;
  readingSeries(filters: SeriesFilters): Promise<SensorTypeSeries[]>;
  stationExists(stationId: number): Promise<boolean>;
  listCurrent(filters: CurrentFilters): Promise<StationCurrentRow[]>;
  lastReadingId(): Promise<number>;
  readingsAfter(readingId: number, limit: number): Promise<LiveReading[]>;
}

/** Repositório em memória para os testes: devolve o que foi carregado. */
export class InMemoryMonitoringRepository implements MonitoringRepository {
  snapshots: StationSnapshot[] = [];
  series: SensorTypeSeries[] = [];
  current: StationCurrentRow[] = [];
  liveReadings: LiveReading[] = [];
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
    return (
      this.snapshots.some((s) => s.id === stationId) ||
      this.current.some((s) => s.id === stationId)
    );
  }

  async listCurrent(filters: CurrentFilters): Promise<StationCurrentRow[]> {
    return this.current.filter(
      (s) =>
        (filters.station_id === undefined || s.id === filters.station_id) &&
        (filters.property_id === undefined ||
          s.property_id === filters.property_id),
    );
  }

  async lastReadingId(): Promise<number> {
    return this.liveReadings.reduce((max, r) => Math.max(max, r.reading_id), 0);
  }

  async readingsAfter(
    readingId: number,
    limit: number,
  ): Promise<LiveReading[]> {
    return this.liveReadings
      .filter((r) => r.reading_id > readingId)
      .sort((a, b) => a.reading_id - b.reading_id)
      .slice(0, limit);
  }
}
