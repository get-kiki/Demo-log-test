import { useState } from "react";
import { useAlerts, useUpdateAlertStatus, type AlertEvent } from "../api/alerts.ts";
import { STATUS } from "../lib/colors.ts";

const STATUS_TABS = [
  { value: "", label: "ทั้งหมด" },
  { value: "open", label: "Open" },
  { value: "ack", label: "Ack" },
  { value: "closed", label: "Closed" },
];

// alert_events ไม่มี severity ของตัวเอง (มันคือ "เหตุการณ์ที่เกิดจาก rule"
// ไม่ใช่ log แถวเดียว) ใช้สี status แทนความเร่งด่วน: open = ยังไม่มีใครจัดการ
// (แดง) ack = รับทราบแล้วกำลังดู (เหลือง) closed = จบแล้ว (เขียว)
const STATUS_COLOR: Record<AlertEvent["status"], string> = {
  open: STATUS.critical,
  ack: STATUS.warning,
  closed: STATUS.good,
};

function formatTs(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
}

// details เป็น JSONB อิสระ (รูปร่างขึ้นกับ group_by ของแต่ละ rule) — แยก
// hits/threshold/window_minutes ที่รู้จักแน่ๆ ออกมาสรุปเป็นประโยคเดียว ที่เหลือ
// (เช่น src_ip, user — ค่าที่ group_by จริง) แสดงเป็น key: value ถัดไป
function summarizeDetails(details: Record<string, unknown>): { headline: string; rest: [string, unknown][] } {
  const { hits, threshold, window_minutes, ...rest } = details;
  const headline =
    hits !== undefined && threshold !== undefined && window_minutes !== undefined
      ? `${hits}/${threshold} ครั้ง ภายใน ${window_minutes} นาที`
      : "";
  return { headline, rest: Object.entries(rest) };
}

export function Alerts() {
  const [status, setStatus] = useState("");
  const { data, isLoading, isError } = useAlerts(status || undefined);
  const updateStatus = useUpdateAlertStatus();

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatus(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              status === tab.value ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Triggered</th>
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2">รายละเอียด</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  กำลังโหลด...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-red-600">
                  โหลดไม่สำเร็จ
                </td>
              </tr>
            ) : !data || data.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  ไม่มี alert
                </td>
              </tr>
            ) : (
              data.map((alert) => {
                const { headline, rest } = summarizeDetails(alert.details);
                return (
                  <tr key={alert.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: STATUS_COLOR[alert.status] }}
                        />
                        <span className="text-slate-700">{alert.status}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-500">
                      {formatTs(alert.triggered_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{alert.rule_name}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {headline && <span>{headline}</span>}
                      {rest.length > 0 && (
                        <span className="ml-2 text-slate-500">
                          {rest.map(([k, v]) => `${k}=${v}`).join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {alert.status === "open" && (
                          <button
                            type="button"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: alert.id, status: "ack" })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                          >
                            Ack
                          </button>
                        )}
                        {alert.status !== "closed" && (
                          <button
                            type="button"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: alert.id, status: "closed" })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
