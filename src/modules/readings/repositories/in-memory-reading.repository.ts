import type {
  ReadingRepository,
  ReadingsQueryResult,
} from "@/modules/readings/repositories/reading.repository.js";
import type {
  CreateReadingInput,
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import { resolveTimeRange } from "@/modules/readings/utils/date-filter.js";

export class InMemoryReadingRepository implements ReadingRepository {
  public readings: (Reading & { station_id?: number })[] = [];
  public knownStationIds?: Set<number>;
  private nextId = 1;

  async create(data: CreateReadingInput): Promise<Reading> {
    const reading: Reading = {
      id: this.nextId++,
      sensor_id: data.sensor_id,
      value: data.value,
      unix_time: data.unix_time,
      data_consistent: data.data_consistent ?? true,
      created_at: new Date(),
    };
    this.readings.push(reading);
    return reading;
  }

  async createMany(data: CreateReadingInput[]): Promise<Reading[]> {
    const created: Reading[] = [];
    for (const item of data) {
      created.push(await this.create(item));
    }
    return created;
  }

  async stationExists(stationId: number): Promise<boolean> {
    if (this.knownStationIds !== undefined) {
      return this.knownStationIds.has(stationId);
    }
    return this.readings.some((r) => r.station_id === stationId);
  }

  async findMany(filters: ListReadingsFilters): Promise<ReadingsQueryResult> {
    const { startUnixTime, endUnixTime } = resolveTimeRange(filters);

    let filtered = [...this.readings];

    if (filters.sensor_id !== undefined) {
      filtered = filtered.filter((r) => r.sensor_id === filters.sensor_id);
    }

    if (filters.station_id !== undefined) {
      filtered = filtered.filter((r) => r.station_id === filters.station_id);
    }

    if (startUnixTime !== undefined) {
      filtered = filtered.filter((r) => r.unix_time >= startUnixTime);
    }

    if (endUnixTime !== undefined) {
      filtered = filtered.filter((r) => r.unix_time <= endUnixTime);
    }

    filtered.sort((a, b) => b.unix_time - a.unix_time || b.id - a.id);

    const total_records = filtered.length;
    const offset = (filters.page - 1) * filters.limit;
    const data = filtered.slice(offset, offset + filters.limit).map((r) => ({
      id: r.id,
      sensor_id: r.sensor_id,
      value: r.value,
      unix_time: r.unix_time,
      data_consistent: r.data_consistent,
      created_at: r.created_at,
    }));

    return { data, total_records };
  }
}
