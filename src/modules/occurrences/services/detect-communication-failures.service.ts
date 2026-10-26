import type { CommunicationMonitorRepository } from "@/modules/occurrences/repositories/occurrence.repository.js";
import type { CommunicationCheckResult } from "@/modules/occurrences/types/occurrence.type.js";

/**
 * Rotina de estações sem comunicação (SCRUM-423). Critério: mais de
 * `thresholdMinutes` desde `last_communication_at` — o mesmo limite que deixa a
 * estação Offline no monitoramento. Estação que nunca comunicou conta a partir
 * do cadastro, para não acusar falha numa estação recém-criada. Quando a
 * estação volta a comunicar, a ocorrência aberta é resolvida automaticamente.
 */
export class DetectCommunicationFailuresService {
  constructor(
    private readonly repository: CommunicationMonitorRepository,
    private readonly thresholdMinutes: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(): Promise<CommunicationCheckResult> {
    const now = this.clock();
    const limitMs = this.thresholdMinutes * 60_000;
    const [stations, open] = await Promise.all([
      this.repository.listStationCommunications(),
      this.repository.listOpenCommunicationFailures(),
    ]);
    const openByStation = new Map<number, number[]>();
    for (const occurrence of open) {
      const ids = openByStation.get(occurrence.station_id) ?? [];
      ids.push(occurrence.id);
      openByStation.set(occurrence.station_id, ids);
    }

    let opened = 0;
    const toResolve: number[] = [];
    for (const station of stations) {
      const reference = station.last_communication_at ?? station.created_at;
      const silentMs = now.getTime() - reference.getTime();
      const openIds = openByStation.get(station.station_id);
      if (silentMs > limitMs) {
        if (openIds) continue;
        const description = station.last_communication_at
          ? `${station.station_name} sem comunicação há ${Math.floor(silentMs / 60_000)} min (limite de ${this.thresholdMinutes} min). Última comunicação: ${formatBrasilia(station.last_communication_at)}.`
          : `${station.station_name} sem nenhuma comunicação registrada desde o cadastro (limite de ${this.thresholdMinutes} min).`;
        if (
          await this.repository.openCommunicationFailure({
            station_id: station.station_id,
            description,
            detected_at: now,
          })
        )
          opened++;
      } else if (openIds) {
        toResolve.push(...openIds);
      }
    }

    const resolved =
      toResolve.length > 0
        ? await this.repository.resolveOccurrences(toResolve, now)
        : 0;
    return {
      stations_checked: stations.length,
      failures_opened: opened,
      failures_resolved: resolved,
    };
  }
}

const brasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Data legível no fuso de Brasília para a descrição da ocorrência. */
function formatBrasilia(date: Date): string {
  return brasilia.format(date);
}
