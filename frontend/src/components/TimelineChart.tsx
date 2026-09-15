import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimelinePoint } from "../api/stats.ts";
import { CHART, colorForSource, SOURCE_COLORS } from "../lib/colors.ts";

interface Props {
  data: TimelinePoint[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
}

interface Row {
  bucket: string;
  [source: string]: string | number;
}

function pivot(data: TimelinePoint[]): { rows: Row[]; sources: string[] } {
  const present = new Set(data.map((d) => d.source));
  // เรียงตามลำดับคงที่ของ SOURCE_COLORS เสมอ (ไม่ใช่ลำดับที่เจอในข้อมูล) —
  // สีของแต่ละ source ต้องไม่สลับที่กันเวลาข้อมูลเปลี่ยน
  const sources = Object.keys(SOURCE_COLORS).filter((s) => present.has(s));

  const byBucket = new Map<string, Row>();
  for (const point of data) {
    let row = byBucket.get(point.bucket);
    if (!row) {
      row = { bucket: point.bucket };
      byBucket.set(point.bucket, row);
    }
    row[point.source] = point.count;
  }

  const rows = Array.from(byBucket.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  return { rows, sources };
}

function formatBucket(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// custom tooltip: value นำหน้า (ตัวหนา) label ตาม (ตัวรอง) + คีย์สีเป็นขีดสั้นๆ
// ไม่ใช่กล่องสี่เหลี่ยม ตามที่ dataviz skill กำหนดไว้สำหรับความหนาแน่นระดับ tooltip
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-card-lg">
      <p className="mb-1 text-slate-500">{formatBucket(label)}</p>
      {payload
        .filter((p: any) => p.value)
        .map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3" style={{ backgroundColor: p.color }} />
            <span className="font-semibold text-slate-900">{p.value.toLocaleString()}</span>
            <span className="text-slate-500">{p.dataKey}</span>
          </div>
        ))}
    </div>
  );
}

export function TimelineChart({ data, isLoading, isFetching, isError }: Props) {
  if (isLoading) {
    return <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />;
  }
  if (isError) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-red-600">
        โหลด timeline ไม่สำเร็จ
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
        ไม่มีข้อมูลในช่วงเวลานี้
      </div>
    );
  }

  const { rows, sources } = pivot(data);

  return (
    <div
      className="h-72 rounded-xl border border-slate-200 p-4 shadow-card transition-opacity"
      style={{ backgroundColor: CHART.surface, opacity: isFetching ? 0.6 : 1 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} maxBarSize={24}>
          <CartesianGrid vertical={false} stroke={CHART.gridline} />
          <XAxis
            dataKey="bucket"
            tickFormatter={formatBucket}
            stroke={CHART.baseline}
            tick={{ fill: CHART.mutedInk, fontSize: 11 }}
          />
          <YAxis stroke={CHART.baseline} tick={{ fill: CHART.mutedInk, fontSize: 11 }} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART.gridline, opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: CHART.secondaryInk }} />
          {sources.map((source) => (
            <Bar
              key={source}
              dataKey={source}
              stackId="events"
              fill={colorForSource(source)}
              stroke={CHART.surface}
              strokeWidth={2}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
