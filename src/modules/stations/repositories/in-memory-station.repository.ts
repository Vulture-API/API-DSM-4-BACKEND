import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type {
  CreateStationData,
  ListStationsFilters,
  PaginatedStations,
  Station,
  UpdateStationData,
} from "@/modules/stations/types/station.type.js";

// Fake usado nos testes: mesma interface, sem tocar no banco.
export class InMemoryStationRepository implements StationRepository {
  public readonly stations: Station[] = [];
  public readonly propertyIds = new Set<number>([1, 2, 3]);

  private nextId = 1;

  async create(data: CreateStationData): Promise<Station> {
    const station: Station = {
      id: this.nextId++,
      property_id: data.property_id,
      mac_address: data.mac_address,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      last_communication_at: null,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    };

    this.stations.push(station);

    return station;
  }

  async findMany(filters: ListStationsFilters): Promise<PaginatedStations> {
    const filtered = this.stations.filter(
      (station) =>
        filters.property_id === undefined ||
        station.property_id === filters.property_id,
    );

    const offset = (filters.page - 1) * filters.limit;

    return {
      data: filtered.slice(offset, offset + filters.limit),
      total_records: filtered.length,
    };
  }

  async findById(id: number): Promise<Station | null> {
    return this.stations.find((station) => station.id === id) ?? null;
  }

  async findByMacAddress(macAddress: string): Promise<Station | null> {
    return (
      this.stations.find((station) => station.mac_address === macAddress) ??
      null
    );
  }

  async update(id: number, data: UpdateStationData): Promise<Station | null> {
    const station = this.stations.find((item) => item.id === id);

    if (!station) return null;

    station.property_id = data.property_id;
    station.mac_address = data.mac_address;
    station.name = data.name;
    station.latitude = data.latitude;
    station.longitude = data.longitude;

    return station;
  }

  async delete(id: number): Promise<boolean> {
    const index = this.stations.findIndex((station) => station.id === id);

    if (index === -1) return false;

    this.stations.splice(index, 1);

    return true;
  }

  async propertyExists(propertyId: number): Promise<boolean> {
    return this.propertyIds.has(propertyId);
  }

  async listProperties(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  > {
    return [
      { id: 1, name: "Fazenda Santa Clara", location: "Piracicaba - SP" },
      { id: 2, name: "Sítio Boa Vista", location: "Jacareí - SP" },
      {
        id: 3,
        name: "Fazenda Santa Rita",
        location: "São José dos Campos - SP",
      },
    ];
  }
}
