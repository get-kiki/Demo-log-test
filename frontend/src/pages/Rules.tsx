import { useAuth } from "../auth/AuthContext.tsx";
import { useRules, useUpdateRule, useDeleteRule } from "../api/rules.ts";
import { errorMessage } from "../api/client.ts";
import { RuleForm } from "../components/RuleForm.tsx";

function conditionSummary(condition: { action?: string; event_type_contains?: string; window_minutes: number; threshold: number; group_by: string[] }): string {
  const parts: string[] = [];
  if (condition.action) parts.push(`action=${condition.action}`);
  if (condition.event_type_contains) parts.push(`event_type มีคำว่า "${condition.event_type_contains}"`);
  parts.push(`≥${condition.threshold} ครั้งใน ${condition.window_minutes} นาที`);
  parts.push(`แยกตาม ${condition.group_by.join(", ")}`);
  return parts.join(" · ");
}

export function Rules() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useRules();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();

  return (
    <div className="space-y-6">
      <RuleForm tenants={user?.tenants ?? []} onCreated={refetch} />

      {/* updateRule ใช้ร่วมกันทั้ง checkbox เปิด/ปิด และในอนาคตถ้ามีฟอร์มแก้ไข —
          แสดง error ล่าสุดของ mutation ตัวไหนก็ได้ที่พังไว้ตรงนี้จุดเดียว ไม่ต้อง
          แยกตามแถว เพราะ react-query mutation เก็บ state แค่ของการเรียกล่าสุดอยู่แล้ว */}
      {(updateRule.isError || deleteRule.isError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(updateRule.error ?? deleteRule.error)}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">เปิดใช้</th>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">เงื่อนไข</th>
              <th className="px-3 py-2">ช่องทาง</th>
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
                  ยังไม่มี rule — สร้างด้านบนได้เลย
                </td>
              </tr>
            ) : (
              data.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) => updateRule.mutate({ id: rule.id, patch: { enabled: e.target.checked } })}
                    />
                  </td>
                  <td className="px-3 py-2 text-slate-800">{rule.name}</td>
                  <td className="px-3 py-2 text-slate-500">{conditionSummary(rule.condition)}</td>
                  <td className="px-3 py-2 text-slate-700">{rule.channel}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`ลบ rule "${rule.name}"?`)) deleteRule.mutate(rule.id);
                      }}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
