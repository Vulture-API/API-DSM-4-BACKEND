import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";
import { ReceiveStationDataService } from "@/modules/readings/services/receive-station-data.service.js";
import { InMemorySensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("ReceiveStationDataService", () => {
  let readingRepository: InMemoryReadingRepository;
  let sensorRepository: InMemorySensorRepository;
  let stationRepository: InMemoryStationRepository;
  let service: ReceiveStationDataService;
  const fixedDate = new Date("2026-10-16T12:00:00.000Z");

  beforeEach(async () => {
    readingRepository = new InMemoryReadingRepository();
    sensorRepository = new InMemorySensorRepository();
    stationRepository = new InMemoryStationRepository();

    await stationRepository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Teste",
      latitude: -23.5,
      longitude: -46.6,
    });

    await sensorRepository.create({
      station_id: 1,
      sensor_type_id: 1,
      local_identifier: "DHT22_TEMP",
      operational_status: true,
      min_value: -10,
      max_value: 50,
    });

    await sensorRepository.create({
      station_id: 1,
      sensor_type_id: 2,
      local_identifier: "DHT22_HUM",
      operational_status: true,
      min_value: 0,
      max_value: 100,
    });

    service = new ReceiveStationDataService(
      readingRepository,
      sensorRepository,
      stationRepository,
      () => fixedDate,
    );
  });

  it("deve receber e persistir leituras enviadas por station_id e local_identifier", async () => {
    const input = {
      station_id: 1,
      unix_time: 1728000000,
      readings: [
        { local_identifier: "DHT22_TEMP", value: 23.4 },
        { local_identifier: "DHT22_HUM", value: 65.0 },
      ],
    };

    const result = await service.execute(input);

    expect(result).toHaveLength(2);
    expect(result[0]!.sensor_id).toBe(1);
    expect(result[0]!.value).toBe(23.4);
    expect(result[0]!.data_consistent).toBe(true);

    expect(result[1]!.sensor_id).toBe(2);
    expect(result[1]!.value).toBe(65.0);
    expect(result[1]!.data_consistent).toBe(true);

    const station = await stationRepository.findById(1);
    expect(station?.last_communication_at).toEqual(fixedDate);
  });

  it("deve receber leituras identificadas por mac_address", async () => {
    const input = {
      mac_address: "AA:BB:CC:DD:EE:01",
      unix_time: 1728000000,
      readings: [{ sensor_id: 1, value: 24.0 }],
    };

    const result = await service.execute(input);

    expect(result).toHaveLength(1);
    expect(result[0]!.sensor_id).toBe(1);
    expect(result[0]!.value).toBe(24.0);

    const station = await stationRepository.findById(1);
    expect(station?.last_communication_at).toEqual(fixedDate);
  });

  it("deve marcar data_consistent como false em leituras fora da faixa", async () => {
    const input = {
      station_id: 1,
      unix_time: 1728000000,
      readings: [{ local_identifier: "DHT22_TEMP", value: 80.0 }],
    };

    const result = await service.execute(input);

    expect(result).toHaveLength(1);
    expect(result[0]!.data_consistent).toBe(false);
  });

  it("deve lancar StationNotFoundError quando estacao nao existir", async () => {
    const input = {
      station_id: 999,
      readings: [{ sensor_id: 1, value: 24.0 }],
    };

    await expect(service.execute(input)).rejects.toThrow(StationNotFoundError);
  });
});
