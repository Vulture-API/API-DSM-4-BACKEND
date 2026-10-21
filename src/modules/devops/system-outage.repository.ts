import crypto from "node:crypto";

import type { Pool } from "pg";

import {
  type FailureDetails,
  type OutageFilterDTO,
  type SystemOutage,
} from "./system-outage.entity.js";

export interface SystemOutageRepository {
  create(
    data: Omit<SystemOutage, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<SystemOutage>;
  findById(id: string): Promise<SystemOutage | null>;
  findOpenByService(service: string): Promise<SystemOutage | null>;
  resolve(
    id: string,
    update: {
      endTime: string;
      durationSeconds: number;
      failureDetails?: FailureDetails;
    },
  ): Promise<SystemOutage | null>;
  list(filter?: OutageFilterDTO): Promise<SystemOutage[]>;
  clear?(): Promise<void>;
}

export class InMemorySystemOutageRepository implements SystemOutageRepository {
  private outages: SystemOutage[] = [];

  async create(
    data: Omit<SystemOutage, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<SystemOutage> {
    const now = new Date().toISOString();
    const outage: SystemOutage = {
      ...data,
      id:
        data.id ??
        `outage-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      failureDetails: data.failureDetails ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.outages.push(outage);
    return outage;
  }

  async findById(id: string): Promise<SystemOutage | null> {
    const found = this.outages.find((o) => o.id === id);
    return found ? { ...found } : null;
  }

  async findOpenByService(service: string): Promise<SystemOutage | null> {
    const found = this.outages.find(
      (o) => o.service === service && o.status === "OPEN",
    );
    return found ? { ...found } : null;
  }

  async resolve(
    id: string,
    update: {
      endTime: string;
      durationSeconds: number;
      failureDetails?: FailureDetails;
    },
  ): Promise<SystemOutage | null> {
    const index = this.outages.findIndex((o) => o.id === id);
    if (index === -1) return null;

    const existing = this.outages[index];
    if (!existing) return null;

    const updated: SystemOutage = {
      ...existing,
      status: "RESOLVED",
      endTime: update.endTime,
      durationSeconds: update.durationSeconds,
      failureDetails: {
        ...existing.failureDetails,
        ...(update.failureDetails ?? {}),
      },
      updatedAt: new Date().toISOString(),
    };

    this.outages[index] = updated;
    return { ...updated };
  }

  async list(filter?: OutageFilterDTO): Promise<SystemOutage[]> {
    let result = [...this.outages];

    if (filter?.service) {
      result = result.filter((o) => o.service === filter.service);
    }
    if (filter?.status) {
      result = result.filter((o) => o.status === filter.status);
    }
    if (filter?.from) {
      const fromTime = new Date(filter.from).getTime();
      result = result.filter(
        (o) => new Date(o.startTime).getTime() >= fromTime,
      );
    }
    if (filter?.to) {
      const toTime = new Date(filter.to).getTime();
      result = result.filter((o) => new Date(o.startTime).getTime() <= toTime);
    }

    // Ordena do mais recente para o mais antigo
    result.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );

    const limit = filter?.limit ?? 50;
    return result.slice(0, limit);
  }

  async clear(): Promise<void> {
    this.outages = [];
  }
}

type SystemOutageDbRow = {
  id: string;
  service: string;
  severity: SystemOutage["severity"];
  status: SystemOutage["status"];
  start_time: Date | string;
  end_time: Date | string | null;
  duration_seconds: number | string | null;
  reason: string;
  failure_details: string | FailureDetails | null;
  created_at: Date | string;
  updated_at: Date | string;
};

export class PgSystemOutageRepository implements SystemOutageRepository {
  private tableInitialized = false;

  constructor(private readonly pool: Pool) {}

  private async ensureTable(): Promise<void> {
    if (this.tableInitialized) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS system_outages (
          id VARCHAR(64) PRIMARY KEY,
          service VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL,
          start_time TIMESTAMPTZ NOT NULL,
          end_time TIMESTAMPTZ,
          duration_seconds NUMERIC(12, 2),
          reason TEXT NOT NULL,
          failure_details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_system_outages_service ON system_outages (service);
        CREATE INDEX IF NOT EXISTS idx_system_outages_status ON system_outages (status);
        CREATE INDEX IF NOT EXISTS idx_system_outages_start_time ON system_outages (start_time DESC);
      `);
      this.tableInitialized = true;
    } catch {
      // Ignora erro de corrida ou permissão em caso de tabela já existente
      this.tableInitialized = true;
    }
  }

  private mapRow(row: SystemOutageDbRow): SystemOutage {
    return {
      id: row.id,
      service: row.service,
      severity: row.severity,
      status: row.status,
      startTime:
        row.start_time instanceof Date
          ? row.start_time.toISOString()
          : new Date(row.start_time).toISOString(),
      endTime: row.end_time
        ? row.end_time instanceof Date
          ? row.end_time.toISOString()
          : new Date(row.end_time).toISOString()
        : null,
      durationSeconds:
        row.duration_seconds !== null && row.duration_seconds !== undefined
          ? Number(row.duration_seconds)
          : null,
      reason: row.reason,
      failureDetails:
        typeof row.failure_details === "string"
          ? JSON.parse(row.failure_details)
          : (row.failure_details ?? {}),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : new Date(row.updated_at).toISOString(),
    };
  }

  async create(
    data: Omit<SystemOutage, "id" | "createdAt" | "updatedAt"> & {
      id?: string;
    },
  ): Promise<SystemOutage> {
    await this.ensureTable();
    const id =
      data.id ??
      `outage-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const now = new Date();

    const query = `
      INSERT INTO system_outages (
        id, service, severity, status, start_time, end_time,
        duration_seconds, reason, failure_details, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      id,
      data.service,
      data.severity,
      data.status,
      data.startTime,
      data.endTime ?? null,
      data.durationSeconds ?? null,
      data.reason,
      JSON.stringify(data.failureDetails ?? {}),
      now,
      now,
    ];

    const result = await this.pool.query(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to insert system outage record.");
    }
    return this.mapRow(row);
  }

  async findById(id: string): Promise<SystemOutage | null> {
    await this.ensureTable();
    const result = await this.pool.query(
      `SELECT * FROM system_outages WHERE id = $1;`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findOpenByService(service: string): Promise<SystemOutage | null> {
    await this.ensureTable();
    const result = await this.pool.query(
      `SELECT * FROM system_outages WHERE service = $1 AND status = 'OPEN' ORDER BY start_time DESC LIMIT 1;`,
      [service],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async resolve(
    id: string,
    update: {
      endTime: string;
      durationSeconds: number;
      failureDetails?: FailureDetails;
    },
  ): Promise<SystemOutage | null> {
    await this.ensureTable();
    const existing = await this.findById(id);
    if (!existing) return null;

    const mergedDetails = {
      ...existing.failureDetails,
      ...(update.failureDetails ?? {}),
    };

    const query = `
      UPDATE system_outages
      SET
        status = 'RESOLVED',
        end_time = $1,
        duration_seconds = $2,
        failure_details = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;

    const values = [
      update.endTime,
      update.durationSeconds,
      JSON.stringify(mergedDetails),
      id,
    ];

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async list(filter?: OutageFilterDTO): Promise<SystemOutage[]> {
    await this.ensureTable();
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filter?.service) {
      conditions.push(`service = $${idx++}`);
      values.push(filter.service);
    }
    if (filter?.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filter.status);
    }
    if (filter?.from) {
      conditions.push(`start_time >= $${idx++}`);
      values.push(filter.from);
    }
    if (filter?.to) {
      conditions.push(`start_time <= $${idx++}`);
      values.push(filter.to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter?.limit ?? 50;

    const query = `
      SELECT * FROM system_outages
      ${whereClause}
      ORDER BY start_time DESC
      LIMIT $${idx};
    `;
    values.push(limit);

    const result = await this.pool.query(query, values);
    return result.rows.map((r) => this.mapRow(r));
  }

  async clear(): Promise<void> {
    await this.ensureTable();
    await this.pool.query(`TRUNCATE TABLE system_outages;`);
  }
}
