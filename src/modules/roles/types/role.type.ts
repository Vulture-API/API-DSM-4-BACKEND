export type Role = {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
};

export type RoleWithPermissions = Role & { permissions: string[] };
