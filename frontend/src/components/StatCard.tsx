interface Props {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  tone?: "default" | "warn";
}

// ตัวเลขใหญ่เดี่ยวๆ ใช้ proportional figures ตามปกติ (ไม่ใส่ tabular-nums —
// นั่นสงวนไว้สำหรับคอลัมน์ตัวเลขที่ต้องเรียงชิดกันอย่างในตาราง)
export function StatCard({ label, value, isLoading, isError, tone = "default" }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-sm text-slate-500">{label}</p>
      {isLoading ? (
        <div className="mt-2 h-9 w-16 animate-pulse rounded bg-slate-100" />
      ) : isError ? (
        <p className="mt-2 text-sm text-red-600">โหลดไม่สำเร็จ</p>
      ) : (
        <p className={`mt-1 text-3xl font-semibold ${tone === "warn" && value ? "text-red-600" : "text-slate-900"}`}>
          {value?.toLocaleString() ?? "—"}
        </p>
      )}
    </div>
  );
}
