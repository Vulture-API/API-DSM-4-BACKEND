import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("property routes", () => {
  let app: FastifyInstance;
  let repository: InMemoryPropertyRepository;
  let stationRepository: InMemoryStationRepository;

  const validPayload = {
    name: "Fazenda Bela Vista",
    owner_user_id: 1,
    location: "Campinas - SP",
  };

  beforeEach(async () => {
    repository = new InMemoryPropertyRepository();
    stationRepository = new InMemoryStationRepository();
    repository.users = [{ id: 1 }, { id: 2 }];
    app = buildApp({
      propertyRepository: repository,
      stationRepository,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createProperty(
    payload: Record<string, unknown> = validPayload,
    url = "/api/properties",
  ) {
    return app.inject({
      method: "POST",
      url,
      payload,
    });
  }

  it("should_create_property_when_payload_is_valid", async () => {
    const response = await createProperty();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      name: "Fazenda Bela Vista",
      owner_user_id: 1,
      location: "Campinas - SP",
    });
    expect(response.json().created_at).toBeDefined();
    expect(repository.properties).toHaveLength(1);
  });

  it("should_create_property_when_location_is_null_or_omitted", async () => {
    const responseNull = await createProperty({
      name: "Fazenda A",
      owner_user_id: 1,
      location: null,
    });
    const responseOmitted = await createProperty({
      name: "Fazenda B",
      owner_user_id: 2,
    });

    expect(responseNull.statusCode).toBe(201);
    expect(responseNull.json().location).toBeNull();
    expect(responseOmitted.statusCode).toBe(201);
    expect(responseOmitted.json().location).toBeNull();
  });

  it("should_trim_name_and_location", async () => {
    const response = await createProperty({
      name: "   Fazenda Com Espaços   ",
      owner_user_id: 1,
      location: "   Localização Com Espaços   ",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().name).toBe("Fazenda Com Espaços");
    expect(response.json().location).toBe("Localização Com Espaços");
  });

  it("should_reject_with_400_when_name_is_missing", async () => {
    const response = await createProperty({
      owner_user_id: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_name_is_empty", async () => {
    const response = await createProperty({
      name: "   ",
      owner_user_id: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_name_exceeds_100_chars", async () => {
    const response = await createProperty({
      name: "A".repeat(101),
      owner_user_id: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_owner_user_id_is_missing", async () => {
    const response = await createProperty({
      name: "Fazenda Sem Dono",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_owner_user_id_is_not_positive_integer", async () => {
    const response = await createProperty({
      name: "Fazenda Inválida",
      owner_user_id: -5,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_409_when_owner_user_does_not_exist", async () => {
    const response = await createProperty({
      name: "Fazenda Usuário Inexistente",
      owner_user_id: 9999,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      code: "USER_NOT_FOUND",
      message: "The referenced owner user does not exist.",
    });
  });

  it("should_list_properties_via_get", async () => {
    await createProperty({ name: "Fazenda Beta", owner_user_id: 1 });
    await createProperty({ name: "Fazenda Alfa", owner_user_id: 2 });

    const response = await app.inject({
      method: "GET",
      url: "/api/properties",
    });

    expect(response.statusCode).toBe(200);
    const properties = response.json();
    expect(properties).toHaveLength(2);
    expect(properties[0].name).toBe("Fazenda Alfa");
    expect(properties[1].name).toBe("Fazenda Beta");
  });

  async function updateProperty(
    id: number | string,
    payload: Record<string, unknown>,
    url?: string,
  ) {
    return app.inject({
      method: "PUT",
      url: url ?? `/api/properties/${id}`,
      payload,
    });
  }

  it("should_update_property_when_payload_is_valid", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      name: "Fazenda Nova Aurora",
      owner_user_id: 2,
      location: "Piracicaba - SP",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 1,
      name: "Fazenda Nova Aurora",
      owner_user_id: 2,
      location: "Piracicaba - SP",
    });
    expect(repository.properties[0]?.name).toBe("Fazenda Nova Aurora");
    expect(repository.properties[0]?.owner_user_id).toBe(2);
    expect(repository.properties[0]?.location).toBe("Piracicaba - SP");
  });

  it("should_update_property_with_partial_payload", async () => {
    await createProperty();

    const responseNameOnly = await updateProperty(1, {
      name: "Fazenda Somente Nome",
    });
    expect(responseNameOnly.statusCode).toBe(200);
    expect(responseNameOnly.json().name).toBe("Fazenda Somente Nome");
    expect(responseNameOnly.json().location).toBe("Campinas - SP");

    const responseLocationNull = await updateProperty(1, {
      location: null,
    });
    expect(responseLocationNull.statusCode).toBe(200);
    expect(responseLocationNull.json().location).toBeNull();
  });

  it("should_trim_name_and_location_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      name: "   Nome Trimado   ",
      location: "   Localização Trimada   ",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Nome Trimado");
    expect(response.json().location).toBe("Localização Trimada");
  });

  it("should_reject_with_400_when_name_is_empty_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      name: "   ",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_name_exceeds_100_chars_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      name: "A".repeat(101),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_owner_user_id_is_invalid_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      owner_user_id: -10,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_body_is_empty_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_400_when_id_is_not_positive_integer_on_update", async () => {
    const response = await updateProperty("invalid-id", {
      name: "Fazenda Invalida",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_reject_with_404_when_property_does_not_exist_on_update", async () => {
    const response = await updateProperty(999, {
      name: "Fazenda Fantasma",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
      message: "Property not found.",
    });
  });

  it("should_reject_with_409_when_owner_user_does_not_exist_on_update", async () => {
    await createProperty();

    const response = await updateProperty(1, {
      owner_user_id: 9999,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      statusCode: 409,
      code: "USER_NOT_FOUND",
      message: "The referenced owner user does not exist.",
    });
  });

  it("should_list_stations_associated_with_property", async () => {
    await createProperty();
    await stationRepository.create({
      name: "Estacao Central",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: -23.1,
      longitude: -45.9,
    });
    await stationRepository.create({
      name: "Estacao Norte",
      mac_address: "11:22:33:44:55:02",
      property_id: 1,
      latitude: -23.2,
      longitude: -45.8,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/properties/1/stations",
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("Estacao Central");
    expect(data[1].name).toBe("Estacao Norte");
  });

  it("should_return_empty_array_when_property_has_no_stations", async () => {
    await createProperty();

    const response = await app.inject({
      method: "GET",
      url: "/api/properties/1/stations",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("should_reject_with_404_when_listing_stations_of_nonexistent_property", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/properties/999/stations",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
      message: "Property not found.",
    });
  });

  it("should_reject_with_400_when_property_id_is_invalid_on_list_stations", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/properties/invalid/stations",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_associate_single_station_via_post_with_station_id", async () => {
    await createProperty(); // Property 1
    await createProperty({ ...validPayload, name: "Fazenda 2" }); // Property 2
    await stationRepository.create({
      name: "Estacao 1",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: null,
      longitude: null,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/properties/2/stations",
      payload: { station_id: 1 },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(1);
    expect(data[0].property_id).toBe(2);

    const stationInDb = await stationRepository.findById(1);
    expect(stationInDb?.property_id).toBe(2);
  });

  it("should_associate_multiple_stations_via_post_with_station_ids", async () => {
    await createProperty();
    await createProperty({ ...validPayload, name: "Fazenda Destino" });
    await stationRepository.create({
      name: "Estacao 1",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: null,
      longitude: null,
    });
    await stationRepository.create({
      name: "Estacao 2",
      mac_address: "11:22:33:44:55:02",
      property_id: 1,
      latitude: null,
      longitude: null,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/properties/2/stations",
      payload: { station_ids: [1, 2] },
    });

    expect(response.statusCode).toBe(200);
    const data = response.json();
    expect(data).toHaveLength(2);
    expect(data[0].property_id).toBe(2);
    expect(data[1].property_id).toBe(2);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/properties/2/stations",
    });
    expect(listResponse.json()).toHaveLength(2);
  });

  it("should_associate_stations_via_put_with_station_ids", async () => {
    await createProperty();
    await createProperty({ ...validPayload, name: "Fazenda Destino" });
    await stationRepository.create({
      name: "Estacao 1",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: null,
      longitude: null,
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/properties/2/stations",
      payload: { station_ids: [1] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].property_id).toBe(2);
  });

  it("should_associate_station_via_put_param", async () => {
    await createProperty();
    await createProperty({ ...validPayload, name: "Fazenda Destino" });
    await stationRepository.create({
      name: "Estacao 1",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: null,
      longitude: null,
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/properties/2/stations/1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].property_id).toBe(2);
  });

  it("should_reject_with_404_when_associating_to_nonexistent_property", async () => {
    await stationRepository.create({
      name: "Estacao 1",
      mac_address: "11:22:33:44:55:01",
      property_id: 1,
      latitude: null,
      longitude: null,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/properties/999/stations",
      payload: { station_id: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
      message: "Property not found.",
    });
  });

  it("should_reject_with_404_when_associating_nonexistent_station", async () => {
    await createProperty();

    const response = await app.inject({
      method: "POST",
      url: "/api/properties/1/stations",
      payload: { station_id: 999 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      code: "STATION_NOT_FOUND",
      message: "Station not found.",
    });
  });

  it("should_reject_with_400_when_associating_with_invalid_body", async () => {
    await createProperty();

    const emptyBodyResponse = await app.inject({
      method: "POST",
      url: "/api/properties/1/stations",
      payload: {},
    });
    expect(emptyBodyResponse.statusCode).toBe(400);

    const emptyArrayResponse = await app.inject({
      method: "POST",
      url: "/api/properties/1/stations",
      payload: { station_ids: [] },
    });
    expect(emptyArrayResponse.statusCode).toBe(400);

    const negativeIdResponse = await app.inject({
      method: "POST",
      url: "/api/properties/1/stations",
      payload: { station_id: -1 },
    });
    expect(negativeIdResponse.statusCode).toBe(400);
  });

  it("should_support_all_route_aliases_and_options", async () => {
    await createProperty();

    for (const prefix of ["/api", ""]) {
      const url = `${prefix}/properties`;
      const getResponse = await app.inject({ method: "GET", url });
      expect(getResponse.statusCode).toBe(200);

      const updateResponse = await app.inject({
        method: "PUT",
        url: `${url}/1`,
        payload: { name: `Atualizada ${prefix}` },
      });
      expect(updateResponse.statusCode).toBe(200);

      const getStationsResponse = await app.inject({
        method: "GET",
        url: `${url}/1/stations`,
      });
      expect(getStationsResponse.statusCode).toBe(200);

      const optionsResponse = await app.inject({ method: "OPTIONS", url });
      expect(optionsResponse.statusCode).toBe(204);
      expect(optionsResponse.headers["access-control-allow-origin"]).toBe("*");

      const optionsItemResponse = await app.inject({
        method: "OPTIONS",
        url: `${url}/1`,
      });
      expect(optionsItemResponse.statusCode).toBe(204);
      expect(optionsItemResponse.headers["access-control-allow-origin"]).toBe(
        "*",
      );

      const optionsStationsResponse = await app.inject({
        method: "OPTIONS",
        url: `${url}/1/stations`,
      });
      expect(optionsStationsResponse.statusCode).toBe(204);
      expect(
        optionsStationsResponse.headers["access-control-allow-origin"],
      ).toBe("*");
    }
  });
});
