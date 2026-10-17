import {
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/auth/auth.errors.js";

/** Only authentication/authorization denials share this contract. */
export function authorizationErrorBody(error: unknown) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return { code: error.statusCode, message: error.message, details: [] };
  }
  return undefined;
}
