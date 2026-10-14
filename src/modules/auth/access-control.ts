import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  AuthUnavailableError,
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/auth/auth.errors.js";
import type { AuthRepositoryPort } from "@/modules/auth/repositories/auth.repository.js";
import type { AuthUser } from "@/modules/auth/types.js";
import type { PermissionCode } from "@/modules/permissions/permission-catalog.js";

export type AccessPolicy = {
  public?: boolean;
  permission?: PermissionCode;
  always?: boolean;
  websocket?: boolean;
};
export const WS_COOKIE = "agritech_ws_token";
export const JWT_ISSUER = "agritech-backend";
export const JWT_AUDIENCE = "agritech-api";
export const JWT_TTL_SECONDS = 3600;

declare module "fastify" {
  interface FastifyContextConfig {
    access?: AccessPolicy;
  }
  interface FastifyRequest {
    actor: AuthUser | null;
  }
}

export class AccessControl {
  constructor(
    private readonly app: FastifyInstance,
    private readonly repository: AuthRepositoryPort,
    readonly enabled: boolean,
    readonly configured: boolean,
  ) {}

  async authenticate(request: FastifyRequest): Promise<AuthUser> {
    if (!this.configured) throw new AuthUnavailableError();
    const header = request.headers.authorization;
    const token =
      header?.match(/^Bearer ([^\s]+)$/i)?.[1] ??
      (header === undefined && request.routeOptions.config.access?.websocket
        ? this.app.parseCookie(request.headers.cookie ?? "")[WS_COOKIE]
        : undefined);
    if (!token) throw new UnauthorizedError();
    let sub: string;
    try {
      const payload = this.app.jwt.verify<{ sub: string }>(token);
      if (
        typeof payload.sub !== "string" ||
        !/^[1-9]\d*$/.test(payload.sub) ||
        Number(payload.sub) > 2_147_483_647
      ) {
        throw new UnauthorizedError();
      }
      sub = payload.sub;
    } catch {
      throw new UnauthorizedError();
    }
    const user = await this.repository.findUserById(Number(sub));
    if (!user?.active) throw new UnauthorizedError();
    request.actor = user;
    return user;
  }

  async enforce(request: FastifyRequest): Promise<void> {
    const policy = request.routeOptions.config.access;
    if (!policy || policy.public || (!this.enabled && !policy.always)) return;
    const user = await this.authenticate(request);
    if (policy.permission && !user.permissions.includes(policy.permission))
      throw new ForbiddenError();
  }
}
