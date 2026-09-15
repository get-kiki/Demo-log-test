import { colorForSource } from "../lib/colors.ts";

// จุดสีเดียวกับที่ TimelineChart ใช้เป๊ะ (colorForSource ตัวเดียวกัน) — source
// เดียวกันต้องได้สีเดียวกันทุกหน้าในแอป ไม่ใช่แค่ในกราฟ
export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-800">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorForSource(source) }} />
      {source}
    </span>
  );
}
