const PRESETS = [
  { label: "1 ชม.", hours: 1 },
  { label: "24 ชม.", hours: 24 },
  { label: "7 วัน", hours: 24 * 7 },
];

interface Props {
  onSelect: (hours: number) => void;
}

// filter อยู่แถวเดียว เหนือทุกอย่างที่มันกำกับ (การ์ด, กราฟ, top list) ตามกฎ
// "One row, above the charts" — ไม่ผูกกับ chart การ์ดใดการ์ดหนึ่งโดยเฉพาะ
export function TimeRangePicker({ onSelect }: Props) {
  return (
    <div className="flex gap-1">
      {PRESETS.map((p) => (
        <button
          key={p.hours}
          type="button"
          onClick={() => onSelect(p.hours)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
