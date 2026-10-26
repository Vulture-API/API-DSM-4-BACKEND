import z from "zod";

import { PERMISSION_CODES } from "@/modules/permissions/permission-catalog.js";

export const permissionInputSchema = z.object({
  permissions: z
    .array(z.enum(PERMISSION_CODES))
    .max(PERMISSION_CODES.length)
    .refine(
      (permissions) => new Set(permissions).size === permissions.length,
      "Repeated permissions are not allowed.",
    ),
});
export const rolePermissionsSchema = z.object({
  role_id: z.number().int(),
  permissions: z.array(z.string()),
});
export const permissionSchema = z.object({
  code: z.string(),
  description: z.string(),
});
