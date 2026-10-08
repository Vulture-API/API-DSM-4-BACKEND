import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import type { LiveReading } from "@/modules/monitoring/types/monitoring.type.js";

type Listener = (reading: LiveReading) => void;

export type ReadingsBroadcasterOptions = {
  intervalMs: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
};

/**
 * Busca as leituras novas por id e repassa para quem está conectado.
 * Só consulta o banco enquanto houver inscritos e não usa o checkpoint do
 * motor de regras. Ao conectar o primeiro cliente parte do último id
 * existente, sem reenviar o histórico.
 */
export class ReadingsBroadcaster {
  private readonly listeners = new Set<Listener>();
  private lastReadingId: number | null = null;
  private loop: Promise<void> | null = null;
  private sleeping: { timer: NodeJS.Timeout; resolve: () => void } | null =
    null;
  private closed = false;

  constructor(
    private readonly repository: MonitoringRepository,
    private readonly options: ReadingsBroadcasterOptions,
  ) {}

  get subscribers(): number {
    return this.listeners.size;
  }

  get isPolling(): boolean {
    return this.loop !== null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.loop && !this.closed) this.loop = this.run();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.wake();
    };
  }

  async poll(): Promise<void> {
    if (this.lastReadingId === null) {
      this.lastReadingId = await this.repository.lastReadingId();
      return;
    }
    const readings = await this.repository.readingsAfter(
      this.lastReadingId,
      this.options.batchSize ?? 500,
    );
    for (const reading of readings) {
      this.lastReadingId = reading.reading_id;
      for (const listener of this.listeners) {
        try {
          listener(reading);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.wake();
    await this.loop;
  }

  private async run(): Promise<void> {
    while (this.listeners.size > 0 && !this.closed) {
      try {
        await this.poll();
      } catch (error) {
        this.options.onError?.(error);
      }
      if (this.listeners.size === 0 || this.closed) break;
      await this.sleep();
    }
    this.lastReadingId = null;
    this.loop = null;
  }

  private sleep(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.sleeping = null;
        resolve();
      }, this.options.intervalMs);
      this.sleeping = { timer, resolve };
    });
  }

  private wake(): void {
    if (!this.sleeping) return;
    clearTimeout(this.sleeping.timer);
    const { resolve } = this.sleeping;
    this.sleeping = null;
    resolve();
  }
}
