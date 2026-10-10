import type { User } from "@/modules/users/types/user.type.js";

export type AuthUser = User & { permissions: string[] };
export type Credential = AuthUser & { password_hash: string };
