import crypto from "node:crypto";

import { type AppLogger, logger as defaultLogger } from "./logger.js";
import { sanitizeLogData } from "./sanitizer.js";

export type AuditCategory =
  | "AUTHENTICATION"
  | "USER_MANAGEMENT"
  | "ACCESS_CONTROL"
  | "ENTITY_MUTATION"
  | "SYSTEM";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "BLOCK"
  | "UNBLOCK"
  | "EXECUTE"
  | "DENIED";

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

export interface AuditActor {
  id?: number | string | undefined;
  email?: string | undefined;
  ip?: string | undefined;
}

export interface AuditTarget {
  type: string;
  id?: string | number | undefined;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  category: AuditCategory;
  action: AuditAction;
  operation: string;
  actor?: AuditActor | undefined;
  target?: AuditTarget | undefined;
  result: AuditResult;
  requestId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface AuditFilter {
  category?: AuditCategory | undefined;
  action?: AuditAction | undefined;
  result?: AuditResult | undefined;
  actorId?: string | number | undefined;
  targetType?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  limit?: number | undefined;
}

export class AuditService {
  private static instance: AuditService | null = null;
  private readonly events: (AuditEvent & { _seq: number })[] = [];
  private readonly maxEvents: number;
  private readonly logger: AppLogger;
  private seq = 0;

  constructor(options: { maxEvents?: number; logger?: AppLogger } = {}) {
    this.maxEvents = options.maxEvents ?? 500;
    this.logger = options.logger ?? defaultLogger.child({ component: "audit" });
  }

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  static resetInstance(): void {
    AuditService.instance = null;
  }

  record(
    input: Omit<AuditEvent, "id" | "timestamp"> & { timestamp?: string },
  ): AuditEvent {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
      category: input.category,
      action: input.action,
      operation: input.operation,
      actor: input.actor,
      target: input.target,
      result: input.result,
      requestId: input.requestId,
      details: input.details ? sanitizeLogData(input.details) : undefined,
    };

    // Mantém ring buffer limitado
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push({ ...event, _seq: ++this.seq });

    const logMessage = `[AUDIT] ${event.category}:${event.action} - ${event.operation} (${event.result})`;
    const logPayload = {
      component: "audit",
      category: event.category,
      action: event.action,
      operation: event.operation,
      result: event.result,
      requestId: event.requestId,
      actor: event.actor,
      target: event.target,
      details: event.details,
    };

    if (event.result === "FAILURE" || event.result === "DENIED") {
      this.logger.warn(logPayload, logMessage);
    } else {
      this.logger.info(logPayload, logMessage);
    }

    return event;
  }

  listEvents(filter: AuditFilter = {}): AuditEvent[] {
    let result = [...this.events];

    if (filter.category) {
      result = result.filter((e) => e.category === filter.category);
    }
    if (filter.action) {
      result = result.filter((e) => e.action === filter.action);
    }
    if (filter.result) {
      result = result.filter((e) => e.result === filter.result);
    }
    if (filter.actorId !== undefined) {
      const actorIdStr = String(filter.actorId);
      result = result.filter((e) => String(e.actor?.id) === actorIdStr);
    }
    if (filter.targetType) {
      result = result.filter((e) => e.target?.type === filter.targetType);
    }
    if (filter.fromDate) {
      const fromTime = new Date(filter.fromDate).getTime();
      result = result.filter(
        (e) => new Date(e.timestamp).getTime() >= fromTime,
      );
    }
    if (filter.toDate) {
      const toTime = new Date(filter.toDate).getTime();
      result = result.filter((e) => new Date(e.timestamp).getTime() <= toTime);
    }

    // Ordenação decrescente por data/hora (mais recentes primeiro)
    result.sort((a, b) => {
      const diff =
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return diff !== 0 ? diff : b._seq - a._seq;
    });

    const limit = filter.limit && filter.limit > 0 ? filter.limit : 100;
    return result.slice(0, limit).map(({ _seq, ...event }) => event);
  }

  clear(): void {
    this.events.length = 0;
  }
}
