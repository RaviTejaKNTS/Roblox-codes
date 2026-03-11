export type FreeItemsSortKey = "newest" | "popular" | "updated";

export type FreeItemsSortOption = {
  value: FreeItemsSortKey;
  label: string;
};

export type FreeItemsSearchState = {
  query: string;
  sort: FreeItemsSortKey;
};

export const DEFAULT_SORT: FreeItemsSortKey = "popular";

export const SORT_OPTIONS: FreeItemsSortOption[] = [
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most favorited" },
  { value: "updated", label: "Recently updated" }
];

export function normalizeSearchQuery(value?: string | null): string {
  if (!value) return "";
  return value.trim().slice(0, 80);
}

export function normalizeSortKey(value?: string | null): FreeItemsSortKey {
  if (!value) return DEFAULT_SORT;
  const match = SORT_OPTIONS.find((option) => option.value === value);
  return match ? match.value : DEFAULT_SORT;
}

export function buildSearchQueryString(state: FreeItemsSearchState): string {
  const params = new URLSearchParams();
  if (state.query) {
    params.set("q", state.query);
  }
  if (state.sort !== DEFAULT_SORT) {
    params.set("sort", state.sort);
  }
  return params.toString();
}
