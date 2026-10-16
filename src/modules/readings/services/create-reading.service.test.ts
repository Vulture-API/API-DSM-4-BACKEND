import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";
import { CreateReadingService } from "@/modules/readings/services/create-reading.service.js";
import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import { InMemorySensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("CreateReadingService", () => {
  let readingRepository: InMemoryReadingRepository;
  let sensorRepository: InMemorySensorRepository;
  let stationRepository: InMemoryStationRepository;
  let service: CreateReadingService;
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

    service = new CreateReadingService(
      readingRepository,
      sensorRepository,
      stationRepository,
      () => fixedDate,
    );
  });

  it("deve criar leitura consistente quando dentro dos limites configurados", async () => {
    const input = {
      sensor_id: 1,
      value: 25.5,
      unix_time: 1728000000,
    };

    const result = await service.execute(input);

    expect(result.id).toBeDefined();
    expect(result.sensor_id).toBe(1);
    expect(result.value).toBe(25.5);
    expect(result.unix_time).toBe(1728000000);
    expect(result.data_consistent).toBe(true);

    const station = await stationRepository.findById(1);
    expect(station?.last_communication_at).toEqual(fixedDate);
  });

  it("deve marcar data_consistent como false quando valor ultrapassar limite maximo", async () => {
    const input = {
      sensor_id: 1,
      value: 65.0,
      unix_time: 1728000000,
    };

    const result = await service.execute(input);

    expect(result.value).toBe(65.0);
    expect(result.data_consistent).toBe(false);
  });

  it("deve marcar data_consistent como false quando valor for inferior ao limite minimo", async () => {
    const input = {
      sensor_id: 1,
      value: -20.0,
      unix_time: 1728000000,
    };

    const result = await service.execute(input);

    expect(result.value).toBe(-20.0);
    expect(result.data_consistent).toBe(false);
  });

  it("deve lancar SensorNotFoundError quando sensor informado nao existir", async () => {
    const input = {
      sensor_id: 999,
      value: 20.0,
      unix_time: 1728000000,
    };

    await expect(service.execute(input)).rejects.toThrow(SensorNotFoundError);
  });
});
