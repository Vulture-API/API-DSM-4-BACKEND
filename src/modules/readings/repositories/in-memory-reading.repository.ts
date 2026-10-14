import type {
  ReadingRepository,
  ReadingsQueryResult,
} from "@/modules/readings/repositories/reading.repository.js";
import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import { resolveTimeRange } from "@/modules/readings/utils/date-filter.js";

export class InMemoryReadingRepository implements ReadingRepository {
  public readings: (Reading & { station_id?: number })[] = [];

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
