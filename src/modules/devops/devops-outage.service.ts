import {
  type CreateOutageDTO,
  type FailureDetails,
  type OutageFilterDTO,
  type ResolveOutageDTO,
  type SlaCalculationDTO,
  type SlaValidationResult,
  type SystemOutage,
} from "./system-outage.entity.js";
import {
  InMemorySystemOutageRepository,
  type SystemOutageRepository,
} from "./system-outage.repository.js";

export class DevOpsOutageService {
  private static instance: DevOpsOutageService;

  constructor(
    private readonly repository: SystemOutageRepository = new InMemorySystemOutageRepository(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public static getInstance(
    repository?: SystemOutageRepository,
    clock?: () => Date,
  ): DevOpsOutageService {
    if (!DevOpsOutageService.instance || repository) {
      DevOpsOutageService.instance = new DevOpsOutageService(
        repository ?? new InMemorySystemOutageRepository(),
        clock,
      );
    }
    return DevOpsOutageService.instance;
  }

  public static resetInstance(): void {
    DevOpsOutageService.instance = new DevOpsOutageService();
  }

  /**
   * Inicia o registro de uma nova indisponibilidade no sistema.
   * Caso já exista uma indisponibilidade ABERTA (OPEN) para o mesmo serviço,
   * atualiza os detalhes para evitar duplicação indevida de incidentes em aberto.
   */
  public async startOutage(dto: CreateOutageDTO): Promise<SystemOutage> {
    const existingOpen = await this.repository.findOpenByService(dto.service);
    const now = this.clock().toISOString();

    if (existingOpen) {
      return existingOpen;
    }

    const startTime = dto.startTime ?? now;

    return this.repository.create({
      service: dto.service,
      severity: dto.severity ?? "CRITICAL",
      status: "OPEN",
      startTime,
      endTime: null,
      durationSeconds: null,
      reason: dto.reason,
      failureDetails: {
        ...(dto.failureDetails ?? {}),
        detectionSource: dto.failureDetails?.detectionSource ?? "MANUAL",
      },
    });
  }

  /**
   * Encerra (resolve) uma indisponibilidade em aberto, calculando a duração exata.
   */
  public async resolveOutage(
    id: string,
    dto?: ResolveOutageDTO,
  ): Promise<SystemOutage> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error(`Indisponibilidade com ID '${id}' não encontrada.`);
    }

    if (existing.status === "RESOLVED") {
      return existing;
    }

    const endTime = dto?.endTime ?? this.clock().toISOString();
    const startMs = new Date(existing.startTime).getTime();
    const endMs = new Date(endTime).getTime();
    const durationSeconds = Number(
      Math.max(0, (endMs - startMs) / 1000).toFixed(2),
    );

    const mergedDetails: FailureDetails = {
      ...existing.failureDetails,
      ...(dto?.resolutionNotes ? { resolutionNotes: dto.resolutionNotes } : {}),
      ...(dto?.rootCause ? { rootCause: dto.rootCause } : {}),
    };

    const resolved = await this.repository.resolve(id, {
      endTime,
      durationSeconds,
      failureDetails: mergedDetails,
    });

    if (!resolved) {
      throw new Error(`Falha ao resolver indisponibilidade '${id}'.`);
    }

    return resolved;
  }

  /**
   * Encerra qualquer indisponibilidade aberta para o serviço especificado.
   */
  public async resolveOpenOutageForService(
    service: string,
    dto?: ResolveOutageDTO,
  ): Promise<SystemOutage | null> {
    const openOutage = await this.repository.findOpenByService(service);
    if (!openOutage) return null;
    return this.resolveOutage(openOutage.id, dto);
  }

  /**
   * Registra diretamente uma indisponibilidade já finalizada (início e término conhecidos).
   */
  public async recordCompletedOutage(
    dto: CreateOutageDTO & { endTime: string },
  ): Promise<SystemOutage> {
    const startTime = dto.startTime ?? this.clock().toISOString();
    const endTime = dto.endTime;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    const durationSeconds = Number(
      Math.max(0, (endMs - startMs) / 1000).toFixed(2),
    );

    return this.repository.create({
      service: dto.service,
      severity: dto.severity ?? "CRITICAL",
      status: "RESOLVED",
      startTime,
      endTime,
      durationSeconds,
      reason: dto.reason,
      failureDetails: dto.failureDetails ?? {},
    });
  }

  /**
   * Hook automatizado acionado por verificações de saúde e alertas do sistema.
   * Transiciona o estado de indisponibilidade de acordo com o status operacional.
   */
  public async handleStatusChange(
    service: string,
    status: "HEALTHY" | "DEGRADED" | "UNHEALTHY",
    failureDetails?: FailureDetails,
  ): Promise<SystemOutage | null> {
    if (status === "UNHEALTHY") {
      return this.startOutage({
        service,
        severity: "CRITICAL",
        reason:
          failureDetails?.error ??
          `Alerta automático: serviço ${service} transicionou para UNHEALTHY`,
        failureDetails: {
          ...failureDetails,
          detectionSource: "HEALTH_CHECK",
        },
      });
    }

    if (status === "HEALTHY") {
      return this.resolveOpenOutageForService(service, {
        resolutionNotes:
          "Recuperação automática: serviço retornou ao estado HEALTHY",
      });
    }

    return null;
  }

  /**
   * Consulta o histórico de indisponibilidades com filtros.
   */
  public async listOutages(filter?: OutageFilterDTO): Promise<SystemOutage[]> {
    return this.repository.list(filter);
  }

  /**
   * Obtém detalhes de uma ocorrência específica.
   */
  public async getOutageById(id: string): Promise<SystemOutage | null> {
    return this.repository.findById(id);
  }

  /**
   * Calcula as métricas formais de SLA, disponibilidade e confiabilidade (MTTR e MTTF)
   * com base no histórico de indisponibilidades dentro da janela temporal solicitada.
   */
  public async calculateSlaReport(
    dto?: SlaCalculationDTO,
  ): Promise<SlaValidationResult> {
    const windowHours = dto?.windowHours ?? 720; // 30 dias por padrão
    const slaTargetPercentage = dto?.slaTargetPercentage ?? 99.0;
    const now = this.clock();
    const windowSeconds = windowHours * 3600;
    const windowStartMs = now.getTime() - windowSeconds * 1000;
    const windowStartIso = new Date(windowStartMs).toISOString();
    const windowEndIso = now.toISOString();

    // Busca todas as indisponibilidades relevantes para a janela
    const allOutages = await this.repository.list({
      limit: 500,
    });

    let totalDowntimeSeconds = 0;
    const relevantOutages: SystemOutage[] = [];
    const resolvedDurations: number[] = [];
    let activeOutagesCount = 0;

    for (const outage of allOutages) {
      const outageStartMs = new Date(outage.startTime).getTime();
      const outageEndMs = outage.endTime
        ? new Date(outage.endTime).getTime()
        : now.getTime();

      // Verifica se a ocorrência coincide com a janela de avaliação
      if (outageEndMs < windowStartMs || outageStartMs > now.getTime()) {
        continue;
      }

      relevantOutages.push(outage);

      if (outage.status === "OPEN") {
        activeOutagesCount++;
      } else if (outage.durationSeconds !== null) {
        resolvedDurations.push(outage.durationSeconds);
      }

      // Calcula o impacto de tempo estritamente dentro da janela
      const effectiveStartMs = Math.max(outageStartMs, windowStartMs);
      const effectiveEndMs = Math.min(outageEndMs, now.getTime());
      const effectiveDurationSec = Math.max(
        0,
        (effectiveEndMs - effectiveStartMs) / 1000,
      );

      totalDowntimeSeconds += effectiveDurationSec;
    }

    totalDowntimeSeconds = Number(totalDowntimeSeconds.toFixed(2));
    const uptimeSeconds = Number(
      Math.max(0, windowSeconds - totalDowntimeSeconds).toFixed(2),
    );

    const availabilityPercentage = Number(
      ((uptimeSeconds / windowSeconds) * 100).toFixed(3),
    );

    const slaCompliant = availabilityPercentage >= slaTargetPercentage;
    const slaGapPercentage = Number(
      (availabilityPercentage - slaTargetPercentage).toFixed(3),
    );

    // MTTR: Tempo médio de recuperação em minutos
    const mttrMinutes =
      resolvedDurations.length > 0
        ? Number(
            (
              resolvedDurations.reduce((acc, d) => acc + d, 0) /
              resolvedDurations.length /
              60
            ).toFixed(2),
          )
        : 0;

    // MTTF: Tempo médio até falha em horas
    const mttfHours =
      relevantOutages.length > 0
        ? Number((uptimeSeconds / 3600 / relevantOutages.length).toFixed(2))
        : Number(windowHours.toFixed(2));

    return {
      evaluationWindowHours: windowHours,
      evaluationWindowSeconds: windowSeconds,
      totalTimeSeconds: windowSeconds,
      downtimeSeconds: totalDowntimeSeconds,
      uptimeSeconds,
      availabilityPercentage,
      slaTargetPercentage,
      slaCompliant,
      slaGapPercentage,
      outagesCount: relevantOutages.length,
      activeOutagesCount,
      mttrMinutes,
      mttfHours,
      evaluatedFrom: windowStartIso,
      evaluatedTo: windowEndIso,
      outages: relevantOutages,
    };
  }
}
