import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CanonicalEvent } from "@log-platform/shared";
import { useTimeRange } from "../hooks/useTimeRange.ts";
import { useSearchLogs, type SearchFilters } from "../api/search.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { TimeRangePicker } from "../components/TimeRangePicker.tsx";
import { SearchFiltersBar } from "../components/SearchFiltersBar.tsx";
import { SourceBadge } from "../components/SourceBadge.tsx";
import { SeverityBadge } from "../components/SeverityBadge.tsx";
import { EventDrawer } from "../components/EventDrawer.tsx";

function readFilters(params: URLSearchParams): SearchFilters {
  return {
    tenant: params.get("tenant") ?? undefined,
    source: params.get("source") ?? undefined,
    event_type: params.get("event_type") ?? undefined,
    src_ip: params.get("src_ip") ?? undefined,
    severity_min: params.get("severity_min") ? Number(params.get("severity_min")) : undefined,
    q: params.get("q") ?? undefined,
  };
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}

function toCsv(events: CanonicalEvent[]): string {
  const headers = ["ts", "tenant", "source", "event_type", "severity", "action", "src_ip", "dst_ip", "user", "host"] as const;
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const e of events) lines.push(headers.map((h) => escape(e[h])).join(","));
  return lines.join("\n");
}

function downloadCsv(events: CanonicalEvent[]) {
  const blob = new Blob([toCsv(events)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `logs-${new Date().toISOString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Search() {
  const { user } = useAuth();
  const [range, setPreset] = useTimeRange();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [selected, setSelected] = useState<CanonicalEvent | null>(null);

  const { data, isLoading, isError, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useSearchLogs(
    range,
    filters
  );
  const events = data?.pages.flatMap((p) => p.items) ?? [];

  function applyFilters(next: SearchFilters) {
    setParams((prev) => {
      const merged = new URLSearchParams(prev);
      const entries: [string, string | undefined][] = [
        ["tenant", next.tenant],
        ["source", next.source],
        ["event_type", next.event_type],
        ["src_ip", next.src_ip],
        ["severity_min", next.severity_min?.toString()],
        ["q", next.q],
      ];
      for (const [key, value] of entries) {
        if (value) merged.set(key, value);
        else merged.delete(key);
      }
      return merged;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <TimeRangePicker onSelect={setPreset} />
        <button
          type="button"
          disabled={events.length === 0}
          onClick={() => downloadCsv(events)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
        >
          Export CSV ({events.length})
        </button>
      </div>

      <SearchFiltersBar initial={filters} tenants={user?.tenants ?? []} onApply={applyFilters} />

      <div
        className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card transition-opacity"
        style={{ opacity: isFetching && !isFetchingNextPage ? 0.6 : 1 }}
      >
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Event type</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Src IP</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Host</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td colSpan={8} className="px-3 py-3">
                    <div className="h-4 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-red-600">
                  โหลดไม่สำเร็จ
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  ไม่มีข้อมูลตรงกับ filter ที่ตั้งไว้
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr
                  key={ev.event_id}
                  onClick={() => setSelected(ev)}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">{formatTs(ev.ts)}</td>
                  <td className="px-3 py-2">
                    <SourceBadge source={ev.source} />
                  </td>
                  <td className="px-3 py-2 text-slate-800">{ev.event_type}</td>
                  <td className="px-3 py-2">
                    <SeverityBadge severity={ev.severity} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{ev.action}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">{ev.src_ip ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{ev.user ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">{ev.host ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
          >
            {isFetchingNextPage ? "กำลังโหลด..." : "โหลดเพิ่ม"}
          </button>
        </div>
      )}

      <EventDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
