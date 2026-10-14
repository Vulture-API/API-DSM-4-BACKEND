import type {
  NewCommunicationFailure,
  NewOutOfRange,
  Occurrence,
  OccurrenceFilter,
  ReadingWithLimits,
  StationCommunication,
} from "@/modules/occurrences/types/occurrence.type.js";
import type { Paginated } from "@/shared/types/paginated.type.js";

/** Registro e consulta das ocorrências (SCRUM-425). */
export interface OccurrenceRepository {
  list(filter: OccurrenceFilter): Promise<Paginated<Occurrence>>;
  findById(id: number): Promise<Occurrence | null>;
  /** Resolve só se estiver aberta; devolve null se não existir ou já estiver resolvida. */
  resolve(id: number, at: Date): Promise<Occurrence | null>;
}

/** Dados da rotina de estações sem comunicação (SCRUM-423). */
export interface CommunicationMonitorRepository {
  listStationCommunications(): Promise<StationCommunication[]>;
  listOpenCommunicationFailures(): Promise<
    { id: number; station_id: number }[]
  >;
  /** false quando a estação já tem uma falha aberta (índice único parcial). */
  openCommunicationFailure(data: NewCommunicationFailure): Promise<boolean>;
  resolveOccurrences(ids: number[], at: Date): Promise<number>;
}

/** Dados da validação de limites dos sensores (SCRUM-424). */
export interface SensorLimitRepository {
  getCheckpoint(): Promise<number>;
  setCheckpoint(readingId: number): Promise<void>;
  /** Ordenado por reading_id crescente. */
  findReadingsAfter(
    afterId: number,
    limit: number,
  ): Promise<ReadingWithLimits[]>;
  /**
   * Marca a leitura como inconsistente e abre a ocorrência do sensor, na mesma
   * transação. Devolve false se o sensor já tinha ocorrência aberta (a leitura
   * é marcada do mesmo jeito).
   */
  flagOutOfRange(data: NewOutOfRange): Promise<boolean>;
}
