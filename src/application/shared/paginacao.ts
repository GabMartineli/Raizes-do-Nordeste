export interface ParametrosPaginacao {
  page?: number;
  limit?: number;
}

export interface Pagina<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const LIMITE_PADRAO = 10;
export const LIMITE_MAXIMO = 100;

export function normalizarPaginacao(p: ParametrosPaginacao): { page: number; limit: number; skip: number } {
  const page = Math.max(1, p.page ?? 1);
  const limit = Math.min(LIMITE_MAXIMO, Math.max(1, p.limit ?? LIMITE_PADRAO));
  return { page, limit, skip: (page - 1) * limit };
}

export function montarPagina<T>(data: T[], total: number, page: number, limit: number): Pagina<T> {
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
