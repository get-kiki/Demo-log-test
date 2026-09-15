import { Link } from "react-router-dom";
import type { TopItem } from "../api/stats.ts";

interface Props {
  title: string;
  items: TopItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
  buildHref: (value: string) => string;
}

export function TopList({ title, items, isLoading, isError, buildHref }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="mb-2 text-sm font-medium text-slate-700">{title}</p>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-600">โหลดไม่สำเร็จ</p>
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-slate-500">ไม่มีข้อมูล</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.value}>
              <Link
                to={buildHref(item.value)}
                className="flex items-center justify-between rounded-lg px-2 py-1 text-sm transition-colors hover:bg-slate-100"
              >
                <span className="truncate text-slate-800">{item.value}</span>
                <span className="ml-2 shrink-0 tabular-nums text-slate-500">{item.count.toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
