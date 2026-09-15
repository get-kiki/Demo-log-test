import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiJson } from "./client.ts";
import type { TimeRange } from "../hooks/useTimeRange.ts";

export interface Summary {
  total: number;
  unique_src_ip: number;
  alerts: number;
  parse_errors: number;
}

export interface TimelinePoint {
  bucket: string;
  source: string;
  count: number;
}

export interface TopItem {
  value: string;
  count: number;
}

export interface TopResult {
  top_src_ip: TopItem[];
  top_user: TopItem[];
  top_event_type: TopItem[];
}

function qs(range: TimeRange, extra?: Record<string, string>) {
  return new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString();
}

// เลือกความกว้าง bucket ให้เหมาะกับความยาวของช่วงเวลาที่ดู — ดู 1 ชม. แต่ bucket
// เป็นวันจะได้แท่งเดียว ดู 7 วันแต่ bucket เป็นนาทีจะได้หลายพันแท่งจนอ่านไม่ออก
export function pickInterval(range: TimeRange): string {
  const spanMs = new Date(range.to).getTime() - new Date(range.from).getTime();
  const hours = spanMs / 3600_000;
  if (hours <= 3) return "5 minutes";
  if (hours <= 48) return "1 hour";
  return "1 day";
}

export function useSummary(range: TimeRange) {
  return useQuery({
    queryKey: ["stats", "summary", range.from, range.to],
    queryFn: () => apiJson<Summary>(`/stats/summary?${qs(range)}`),
    placeholderData: keepPreviousData,
  });
}

export function useTimeline(range: TimeRange) {
  const interval = pickInterval(range);
  return useQuery({
    queryKey: ["stats", "timeline", range.from, range.to, interval],
    queryFn: () => apiJson<TimelinePoint[]>(`/stats/timeline?${qs(range, { interval })}`),
    placeholderData: keepPreviousData,
  });
}

export function useTop(range: TimeRange, limit = 8) {
  return useQuery({
    queryKey: ["stats", "top", range.from, range.to, limit],
    queryFn: () => apiJson<TopResult>(`/stats/top?${qs(range, { limit: String(limit) })}`),
    placeholderData: keepPreviousData,
  });
}
