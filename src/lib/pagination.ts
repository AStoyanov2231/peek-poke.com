import { apiError } from "@/lib/api-error";

export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE_NUMBER = 10_000;

export function parsePagination(
  request: Request,
  defaults: { page?: number; limit?: number } = {},
) {
  const pageValue = new URL(request.url).searchParams.get("page");
  const limitValue = new URL(request.url).searchParams.get("limit");
  const page = pageValue === null ? (defaults.page ?? 1) : Number(pageValue);
  const limit = limitValue === null ? (defaults.limit ?? 20) : Number(limitValue);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > MAX_PAGE_NUMBER ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE
  ) {
    return {
      data: null,
      error: apiError("Invalid pagination", 400, "INVALID_PAGINATION"),
    };
  }

  return { data: { page, limit }, error: null };
}
