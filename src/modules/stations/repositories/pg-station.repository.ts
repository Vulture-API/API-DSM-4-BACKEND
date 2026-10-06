import type { DatabaseError, Pool } from "pg";

import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type {
  CreateStationData,
  ListStationsFilters,
  PaginatedStations,
  Station,
  UpdateStationData,
} from "@/modules/stations/types/station.type.js";

const STATION_COLUMNS = `
  id,
  property_id,
  mac_address,
  name,
  latitude::float8 AS latitude,
  longitude::float8 AS longitude,
  last_communication_at,
  created_at
`;

// A checagem de MAC no service e o INSERT/UPDATE são operações separadas: duas
// requisições simultâneas podem passar pela checagem. A constraint UNIQUE do banco
// é a garantia final, e aqui a violação dela vira o 409 documentado em vez de 500.
function rethrowUniqueViolation(error: unknown): never {
  const pgError = error as Partial<DatabaseError>;

  if (
    pgError.code === "23505" &&
    pgError.constraint === "stations_mac_address_unique"
  ) {
    throw new DuplicateMacAddressError();
  }

  throw error;
}

export class PgStationRepository implements StationRepository {
  constructor(private readonly database: Pool) {}

  async create(data: CreateStationData): Promise<Station> {
    const result = await this.database
      .query<Station>(
        `
        INSERT INTO stations (property_id, mac_address, name, latitude, longitude, created_at)
        VALUES ($1, $2, $3, $4, $5, current_timestamp)
        RETURNING ${STATION_COLUMNS}
      `,
        [
          data.property_id,
          data.mac_address,
          data.name,
          data.latitude,
          data.longitude,
        ],
      )
      .catch(rethrowUniqueViolation);

    return result.rows[0]!;
  }

  async findMany(filters: ListStationsFilters): Promise<PaginatedStations> {
    const offset = (filters.page - 1) * filters.limit;

    // O total vem de uma subconsulta própria, e a página entra por LEFT JOIN:
    // numa página além da última a consulta ainda devolve uma linha (com a
    // estação nula) e o total real. Com COUNT(*) OVER() direto na página, uma
    // página vazia não tinha linha de onde ler o total e ele virava 0.
    const result = await this.database.query<
      Partial<Station> & { total_records: string }
    >(
      `
        WITH filtered AS (
          SELECT ${STATION_COLUMNS}
          FROM stations
          WHERE ($1::int IS NULL OR property_id = $1::int)
        )
        SELECT page.*, total.total_records
        FROM (SELECT COUNT(*) AS total_records FROM filtered) AS total
        LEFT JOIN LATERAL (
          SELECT * FROM filtered ORDER BY id ASC LIMIT $2 OFFSET $3
        ) AS page ON true
      `,
      [filters.property_id ?? null, filters.limit, offset],
    );

    const totalRecords = Number(result.rows[0]?.total_records ?? 0);
    const data = result.rows
      .filter((row) => row.id !== null && row.id !== undefined)
      .map(({ total_records: _ignored, ...station }) => station as Station);

    return { data, total_records: totalRecords };
  }

  async findById(id: number): Promise<Station | null> {
    const result = await this.database.query<Station>(
      `SELECT ${STATION_COLUMNS} FROM stations WHERE id = $1`,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async findByMacAddress(macAddress: string): Promise<Station | null> {
    const result = await this.database.query<Station>(
      `SELECT ${STATION_COLUMNS} FROM stations WHERE mac_address = $1`,
      [macAddress],
    );

    return result.rows[0] ?? null;
  }

  async update(id: number, data: UpdateStationData): Promise<Station | null> {
    const result = await this.database
      .query<Station>(
        `
        UPDATE stations
        SET property_id = $2, mac_address = $3, name = $4, latitude = $5, longitude = $6
        WHERE id = $1
        RETURNING ${STATION_COLUMNS}
      `,
        [
          id,
          data.property_id,
          data.mac_address,
          data.name,
          data.latitude,
          data.longitude,
        ],
      )
      .catch(rethrowUniqueViolation);

    return result.rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.database.query(
      `DELETE FROM stations WHERE id = $1`,
      [id],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async propertyExists(propertyId: number): Promise<boolean> {
    const result = await this.database.query(
      `SELECT 1 FROM properties WHERE id = $1`,
      [propertyId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async listProperties(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  > {
    const result = await this.database.query<{
      id: number;
      name: string;
      location: string | null;
    }>("SELECT id, name, location FROM properties ORDER BY name ASC");

    return result.rows;
  }
}
