import type {
  CommunicationMonitorRepository,
  OccurrenceRepository,
  SensorLimitRepository,
} from "@/modules/occurrences/repositories/occurrence.repository.js";
import type {
  NewCommunicationFailure,
  NewOutOfRange,
  Occurrence,
  OccurrenceFilter,
  ReadingWithLimits,
  StationCommunication,
} from "@/modules/occurrences/types/occurrence.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

/** Repositório em memória com as mesmas regras de unicidade do banco. */
export class InMemoryOccurrenceRepository
  implements
    OccurrenceRepository,
    CommunicationMonitorRepository,
    SensorLimitRepository
{
  occurrences: Occurrence[] = [];
  stations: StationCommunication[] = [];
  readings: ReadingWithLimits[] = [];
  checkpoint = 0;
  private nextId = 1;

  async list(filter: OccurrenceFilter): Promise<Paginated<Occurrence>> {
    const matches = this.occurrences
      .filter(
        (o) =>
          (filter.station_id === undefined ||
            o.station_id === filter.station_id) &&
          (filter.sensor_id === undefined ||
            o.sensor_id === filter.sensor_id) &&
          (filter.type === undefined || o.type === filter.type) &&
          (filter.status === undefined || o.status === filter.status) &&
          (filter.from === undefined ||
            new Date(o.detected_at) >= filter.from) &&
          (filter.to === undefined || new Date(o.detected_at) <= filter.to),
      )
      .sort(
        (a, b) => b.detected_at.localeCompare(a.detected_at) || b.id - a.id,
      );
    const start = (filter.page - 1) * filter.limit;
    return {
      data: matches.slice(start, start + filter.limit),
      meta: buildPaginationMeta(matches.length, filter.page, filter.limit),
    };
  }

  async findById(id: number): Promise<Occurrence | null> {
    const found = this.occurrences.find((o) => o.id === id);
    return found ? { ...found } : null;
  }

  async resolve(id: number, at: Date): Promise<Occurrence | null> {
    const found = this.occurrences.find((o) => o.id === id);
    if (!found || found.status !== "OPEN") return null;
    found.status = "RESOLVED";
    found.resolved_at = at.toISOString();
    return { ...found };
  }

  async listStationCommunications(): Promise<StationCommunication[]> {
    return this.stations;
  }

  async listOpenCommunicationFailures(): Promise<
    { id: number; station_id: number }[]
  > {
    return this.occurrences
      .filter((o) => o.type === "COMMUNICATION_FAILURE" && o.status === "OPEN")
      .map((o) => ({ id: o.id, station_id: o.station_id }));
  }

  async openCommunicationFailure(
    data: NewCommunicationFailure,
  ): Promise<boolean> {
    if (
      this.occurrences.some(
        (o) =>
          o.type === "COMMUNICATION_FAILURE" &&
          o.status === "OPEN" &&
          o.station_id === data.station_id,
      )
    )
      return false;
    this.occurrences.push({
      id: this.nextId++,
      type: "COMMUNICATION_FAILURE",
      status: "OPEN",
      station_id: data.station_id,
      station_name:
        this.stations.find((s) => s.station_id === data.station_id)
          ?.station_name ?? "",
      sensor_id: null,
      sensor_identifier: null,
      sensor_type: null,
      reading_id: null,
      value: null,
      description: data.description,
      detected_at: data.detected_at.toISOString(),
      resolved_at: null,
    });
    return true;
  }

  async resolveOccurrences(ids: number[], at: Date): Promise<number> {
    let count = 0;
    for (const id of ids) if (await this.resolve(id, at)) count++;
    return count;
  }

  async getCheckpoint(): Promise<number> {
    return this.checkpoint;
  }

  async setCheckpoint(readingId: number): Promise<void> {
    this.checkpoint = readingId;
  }

  async findReadingsAfter(
    afterId: number,
    limit: number,
  ): Promise<ReadingWithLimits[]> {
    return this.readings
      .filter((r) => r.reading_id > afterId)
      .sort((a, b) => a.reading_id - b.reading_id)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async flagOutOfRange(data: NewOutOfRange): Promise<boolean> {
    const reading = this.readings.find((r) => r.reading_id === data.reading_id);
    if (reading) reading.data_consistent = false;
    if (
      this.occurrences.some(
        (o) =>
          o.type === "OUT_OF_RANGE" &&
          o.status === "OPEN" &&
          o.sensor_id === data.sensor_id,
      )
    )
      return false;
    this.occurrences.push({
      id: this.nextId++,
      type: "OUT_OF_RANGE",
      status: "OPEN",
      station_id: data.station_id,
      station_name: "",
      sensor_id: data.sensor_id,
      sensor_identifier: reading?.sensor_identifier ?? null,
      sensor_type: null,
      reading_id: data.reading_id,
      value: data.value,
      description: data.description,
      detected_at: data.detected_at.toISOString(),
      resolved_at: null,
    });
    return true;
  }
}
