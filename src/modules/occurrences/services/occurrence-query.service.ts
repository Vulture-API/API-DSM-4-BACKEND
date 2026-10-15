import {
  InvalidOccurrencePeriodError,
  OccurrenceAlreadyResolvedError,
  OccurrenceNotFoundError,
} from "@/modules/occurrences/errors/occurrence.errors.js";
import type { OccurrenceRepository } from "@/modules/occurrences/repositories/occurrence.repository.js";
import type {
  Occurrence,
  OccurrenceFilter,
} from "@/modules/occurrences/types/occurrence.type.js";
import type { Paginated } from "@/shared/types/paginated.type.js";

/** Consulta e resolução das ocorrências registradas (SCRUM-425). */
export class OccurrenceQueryService {
  constructor(
    private readonly repository: OccurrenceRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(filter: OccurrenceFilter): Promise<Paginated<Occurrence>> {
    if (filter.from && filter.to && filter.from > filter.to)
      throw new InvalidOccurrencePeriodError();
    return this.repository.list(filter);
  }

  async get(id: number): Promise<Occurrence> {
    const occurrence = await this.repository.findById(id);
    if (!occurrence) throw new OccurrenceNotFoundError();
    return occurrence;
  }

  /**
   * Resolução manual (ex.: sensor trocado após leitura fora do limite). Falha
   * de comunicação resolvida com a estação ainda calada é reaberta pela rotina.
   */
  async resolve(id: number): Promise<Occurrence> {
    const occurrence = await this.get(id);
    if (occurrence.status === "RESOLVED")
      throw new OccurrenceAlreadyResolvedError();
    const resolved = await this.repository.resolve(id, this.clock());
    // Resolvida em paralelo entre a leitura e a gravação.
    if (!resolved) throw new OccurrenceAlreadyResolvedError();
    return resolved;
  }
}
