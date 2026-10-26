import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import type { LiveReading } from "@/modules/monitoring/types/monitoring.type.js";

/** Recebe a leitura e a mensagem já serializada (uma vez para todos). */
type Listener = (reading: LiveReading, message: string) => void;

export type ReadingsBroadcasterOptions = {
  intervalMs: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
};

/**
 * Busca as leituras novas por id e repassa para quem está conectado.
 * Só consulta o banco enquanto houver inscritos e não usa o checkpoint do
 * motor de regras. Ao conectar o primeiro cliente parte do último id
 * existente, sem reenviar o histórico. Lote cheio = consulta de novo sem
 * esperar, para não acumular atraso.
 *
 * O cursor por id assume que as leituras são gravadas em ordem de id, como
 * faz o persistidor (um consumidor, um lote por transação). Com gravações
 * concorrentes, um id menor que fizer commit depois não é enviado; a
 * consulta REST continua com o dado.
 */
export class ReadingsBroadcaster {
  private readonly listeners = new Set<{
    listener: Listener;
    authorize?: () => Promise<void>;
  }>();
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

  private get batchSize(): number {
    return this.options.batchSize ?? 500;
  }

  subscribe(listener: Listener, authorize?: () => Promise<void>): () => void {
    const subscriber = { listener, ...(authorize ? { authorize } : {}) };
    this.listeners.add(subscriber);
    if (!this.loop && !this.closed) this.loop = this.run();
    return () => {
      this.listeners.delete(subscriber);
      if (this.listeners.size === 0) this.wake();
    };
  }

  /** Devolve quantas leituras novas foram repassadas. */
  async poll(): Promise<number> {
    const subscribers = [...this.listeners];
    await Promise.all(
      subscribers.map(async (subscriber) => {
        try {
          await subscriber.authorize?.();
        } catch (error) {
          this.listeners.delete(subscriber);
          this.report(error);
        }
      }),
    );
    if (subscribers.length > 0 && this.listeners.size === 0) return 0;
    if (this.lastReadingId === null) {
      this.lastReadingId = await this.repository.lastReadingId();
      return 0;
    }
    const readings = await this.repository.readingsAfter(
      this.lastReadingId,
      this.batchSize,
    );
    for (const reading of readings) {
      this.lastReadingId = reading.reading_id;
      const message = JSON.stringify({ type: "reading", ...reading });
      for (const { listener } of this.listeners) {
        try {
          listener(reading, message);
        } catch (error) {
          this.report(error);
        }
      }
    }
    return readings.length;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.wake();
    await this.loop;
  }

  private async run(): Promise<void> {
    try {
      while (this.listeners.size > 0 && !this.closed) {
        let full = false;
        try {
          full = (await this.poll()) >= this.batchSize;
        } catch (error) {
          this.report(error);
        }
        if (this.listeners.size === 0 || this.closed) break;
        if (!full) await this.sleep();
      }
    } finally {
      this.lastReadingId = null;
      this.loop = null;
    }
  }

  private report(error: unknown): void {
    try {
      this.options.onError?.(error);
    } catch {
      // O callback de log não pode derrubar o loop.
    }
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
