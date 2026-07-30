import type { FastifyInstance } from "fastify";
import { playerImportSchema } from "@valo-yiba/contracts";
import { env } from "../config.js";
import { upsertPlayerSnapshot } from "../services/player-import.js";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.headers["x-internal-api-secret"] !== env.INTERNAL_API_SECRET) {
      return reply.unauthorized("Invalid internal API secret");
    }
  });

  app.post("/v1/admin/players", async (request, reply) => {
    const player = playerImportSchema.parse(request.body);
    const result = await upsertPlayerSnapshot(player);
    return reply.code(201).send(result);
  });
}
