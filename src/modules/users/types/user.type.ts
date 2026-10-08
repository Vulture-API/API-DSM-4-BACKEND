export type User = {
  id: number;
  role_id: number;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
};

export type PaginationMeta = {
  total_records: number;
  total_pages: number;
  current_page: number;
};

export type PaginatedUsers = {
  data: User[];
  meta: PaginationMeta;
};
