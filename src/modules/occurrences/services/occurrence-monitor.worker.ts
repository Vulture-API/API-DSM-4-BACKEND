import type { CheckSensorLimitsService } from "@/modules/occurrences/services/check-sensor-limits.service.js";
import type { DetectCommunicationFailuresService } from "@/modules/occurrences/services/detect-communication-failures.service.js";
import type { OccurrenceCycleResult } from "@/modules/occurrences/types/occurrence.type.js";

export type OccurrenceMonitorWorkerOptions = {
  intervalMs: number;
  onCycle?: (result: OccurrenceCycleResult) => void;
  onError?: (error: unknown) => void;
};

/**
 * Agenda a verificação de ocorrências com `setTimeout` reagendado (um ciclo
 * lento não se sobrepõe ao próximo), no mesmo modelo do motor de regras.
 */
export class OccurrenceMonitorWorker {
  private timer: NodeJS.Timeout | null = null;
  private current: Promise<OccurrenceCycleResult> | null = null;
  private stopped = true;

  constructor(
    private readonly communication: DetectCommunicationFailuresService,
    private readonly limits: CheckSensorLimitsService,
    private readonly options: OccurrenceMonitorWorkerOptions,
  ) {}

  get isRunning(): boolean {
    return !this.stopped;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.scheduleNext(0);
  }

  /** Para o agendamento e espera o ciclo em andamento (antes de fechar o pool). */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.current?.catch(() => undefined);
  }

  /** `null` quando já existe um ciclo em andamento; falha é repassada. */
  async runOnce(): Promise<OccurrenceCycleResult | null> {
    if (this.current) return null;
    this.current = (async () => ({
      communication: await this.communication.execute(),
      limits: await this.limits.execute(),
    }))();
    try {
      const result = await this.current;
      this.options.onCycle?.(result);
      return result;
    } catch (error) {
      this.options.onError?.(error);
      throw error;
    } finally {
      this.current = null;
    }
  }

  private scheduleNext(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(() => undefined)
        .finally(() => this.scheduleNext(this.options.intervalMs));
    }, delay);
    this.timer.unref?.();
  }
}
