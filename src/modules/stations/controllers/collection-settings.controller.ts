import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  CollectionSettingsBody,
  StationIdParam,
} from "@/modules/stations/schemas/station.schema.js";
import type { GetCollectionSettingsService } from "@/modules/stations/services/get-collection-settings.service.js";
import type { UpdateCollectionSettingsService } from "@/modules/stations/services/update-collection-settings.service.js";

export class CollectionSettingsController {
  constructor(
    private readonly getCollectionSettingsService: GetCollectionSettingsService,
    private readonly updateCollectionSettingsService: UpdateCollectionSettingsService,
  ) {}

  get = async (
    request: FastifyRequest<{ Params: StationIdParam }>,
    reply: FastifyReply,
  ) => {
    const settings = await this.getCollectionSettingsService.execute(
      request.params.id,
    );

    return reply.status(200).send(settings);
  };

  update = async (
    request: FastifyRequest<{
      Params: StationIdParam;
      Body: CollectionSettingsBody;
    }>,
    reply: FastifyReply,
  ) => {
    const settings = await this.updateCollectionSettingsService.execute(
      request.params.id,
      request.body.collection_interval_seconds,
    );

    return reply.status(200).send(settings);
  };
}
