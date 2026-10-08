import type {
  CreateStationData,
  ListStationsFilters,
  PaginatedStations,
  Station,
  UpdateStationData,
} from "@/modules/stations/types/station.type.js";

export interface StationRepository {
  create(data: CreateStationData): Promise<Station>;
  findMany(filters: ListStationsFilters): Promise<PaginatedStations>;
  findById(id: number): Promise<Station | null>;
  findByMacAddress(macAddress: string): Promise<Station | null>;
  update(id: number, data: UpdateStationData): Promise<Station | null>;
  delete(id: number): Promise<boolean>;
  propertyExists(propertyId: number): Promise<boolean>;
  listProperties?(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  >;
}
