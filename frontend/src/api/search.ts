import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { CanonicalEvent } from "@log-platform/shared";
import { apiJson } from "./client.ts";
import type { TimeRange } from "../hooks/useTimeRange.ts";

export interface SearchFilters {
  tenant?: string;
  source?: string;
  event_type?: string;
  src_ip?: string;
  severity_min?: number;
  q?: string;
}

interface SearchPage {
  items: CanonicalEvent[];
  next_cursor: string | null;
}

const LIMIT = 50;

function buildQuery(range: TimeRange, filters: SearchFilters, cursor?: string) {
  const params = new URLSearchParams({ from: range.from, to: range.to, limit: String(LIMIT) });
  if (filters.tenant) params.set("tenant", filters.tenant);
  if (filters.source) params.set("source", filters.source);
  if (filters.event_type) params.set("event_type", filters.event_type);
  if (filters.src_ip) params.set("src_ip", filters.src_ip);
  if (filters.severity_min !== undefined) params.set("severity_min", String(filters.severity_min));
  if (filters.q) params.set("q", filters.q);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

// keyset pagination ฝั่ง backend (ดู logs/repository.ts) จับคู่กับ useInfiniteQuery
// ตรงๆ — getNextPageParam ส่ง next_cursor ที่ backend คำนวณมาให้กลับไปเป็น
// pageParam ของหน้าถัดไป ไม่ต้องคำนวณ offset เองฝั่ง frontend เลย
export function useSearchLogs(range: TimeRange, filters: SearchFilters) {
  return useInfiniteQuery({
    queryKey: ["search", range.from, range.to, filters],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      apiJson<SearchPage>(`/search?${buildQuery(range, filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: SearchPage) => lastPage.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}
