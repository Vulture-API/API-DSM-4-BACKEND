import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";

describe("property routes", () => {
  let app: FastifyInstance;
  let repository: InMemoryPropertyRepository;

  const validPayload = {
    name: "Fazenda Bela Vista",
    owner_user_id: 1,
    location: "Campinas - SP",
  };

  beforeEach(async () => {
    repository = new InMemoryPropertyRepository();
    repository.users = [{ id: 1 }, { id: 2 }];
    app = buildApp({
      propertyRepository: repository,
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

  it("should_support_all_route_aliases_and_options", async () => {
    for (const prefix of ["/api", ""]) {
      const url = `${prefix}/properties`;
      const getResponse = await app.inject({ method: "GET", url });
      expect(getResponse.statusCode).toBe(200);

      const optionsResponse = await app.inject({ method: "OPTIONS", url });
      expect(optionsResponse.statusCode).toBe(204);
      expect(optionsResponse.headers["access-control-allow-origin"]).toBe("*");
    }
  });
});
