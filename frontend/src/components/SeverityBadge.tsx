import { STATUS } from "../lib/colors.ts";

// bucket หยาบๆ ตามที่ docs/severity-mapping.md อธิบายไว้ (severity ยิ่งมากยิ่ง
// ร้ายแรง สเกล 0-10) — ไม่ใช่ mapping ที่ backend ใช้ตัดสิน action/severity เอง
// แค่กลุ่มไว้แสดงผลให้สแกนด้วยตาง่ายๆ
function bucket(severity: number): { color: string; label: string } {
  if (severity >= 9) return { color: STATUS.critical, label: "Critical" };
  if (severity >= 6) return { color: STATUS.serious, label: "Serious" };
  if (severity >= 3) return { color: STATUS.warning, label: "Warning" };
  return { color: STATUS.good, label: "Info" };
}

export function SeverityBadge({ severity }: { severity: number }) {
  const { color, label } = bucket(severity);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="tabular-nums text-slate-800">{severity}</span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}
