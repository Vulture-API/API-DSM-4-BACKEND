export type Property = {
  id: number;
  name: string;
  owner_user_id: number;
  location: string | null;
  created_at: string;
};

export type CreatePropertyInput = {
  name: string;
  owner_user_id: number;
  location?: string | null;
};

export type UpdatePropertyInput = {
  name?: string | undefined;
  owner_user_id?: number | undefined;
  location?: string | null | undefined;
};

export type PropertyRow = {
  id: number;
  name: string;
  owner_user_id: number;
  location: string | null;
  created_at: Date | string;
};
