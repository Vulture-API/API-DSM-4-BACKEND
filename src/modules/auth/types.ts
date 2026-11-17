import type { User } from "@/modules/users/types/user.type.js";

export type AuthUser = User & {
  permissions: string[];
  role_name?: string;
  property_ids?: number[] | null;
};
export type Credential = AuthUser & { password_hash: string };
