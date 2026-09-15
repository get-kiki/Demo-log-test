import { useTimeRange } from "../hooks/useTimeRange.ts";
import { useSummary, useTimeline, useTop } from "../api/stats.ts";
import { TimeRangePicker } from "../components/TimeRangePicker.tsx";
import { StatCard } from "../components/StatCard.tsx";
import { TimelineChart } from "../components/TimelineChart.tsx";
import { TopList } from "../components/TopList.tsx";

export function Overview() {
  const [range, setPreset] = useTimeRange();
  const summary = useSummary(range);
  const timeline = useTimeline(range);
  const top = useTop(range);

  const searchHref = (extra: Record<string, string>) =>
    `/search?${new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString()}`;

  return (
    <div className="space-y-6">
      {/* filter แถวเดียว เหนือทุกอย่างที่มันกำกับ — การ์ด/กราฟ/top list ทั้งหมด
          re-render ตามช่วงเวลาเดียวกัน ตัวเลขเลยตรงกันเสมอ */}
      <TimeRangePicker onSelect={setPreset} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total events" value={summary.data?.total} isLoading={summary.isLoading} isError={summary.isError} />
        <StatCard
          label="Unique source IP"
          value={summary.data?.unique_src_ip}
          isLoading={summary.isLoading}
          isError={summary.isError}
        />
        <StatCard
          label="Open alerts"
          value={summary.data?.alerts}
          isLoading={summary.isLoading}
          isError={summary.isError}
          tone="warn"
        />
        <StatCard
          label="Parse errors"
          value={summary.data?.parse_errors}
          isLoading={summary.isLoading}
          isError={summary.isError}
          tone="warn"
        />
      </div>

      <TimelineChart
        data={timeline.data}
        isLoading={timeline.isLoading}
        isFetching={timeline.isFetching}
        isError={timeline.isError}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TopList
          title="Top source IP"
          items={top.data?.top_src_ip}
          isLoading={top.isLoading}
          isError={top.isError}
          buildHref={(value) => searchHref({ src_ip: value })}
        />
        <TopList
          title="Top user"
          items={top.data?.top_user}
          isLoading={top.isLoading}
          isError={top.isError}
          // ไม่มีคอลัมน์ user แยกใน /search filter ตรงๆ — ใช้ q (free-text ที่
          // ครอบคลุม user อยู่แล้วในฝั่ง backend) เป็นทางเข้าแทน
          buildHref={(value) => searchHref({ q: value })}
        />
        <TopList
          title="Top event type"
          items={top.data?.top_event_type}
          isLoading={top.isLoading}
          isError={top.isError}
          buildHref={(value) => searchHref({ event_type: value })}
        />
      </div>
    </div>
  );
}
