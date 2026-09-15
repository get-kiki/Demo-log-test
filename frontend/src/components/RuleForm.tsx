import { useState } from "react";
import type { AlertCondition } from "@log-platform/shared";
import { useCreateRule, useTestRule, type Channel, type TestMatch } from "../api/rules.ts";
import { STATUS } from "../lib/colors.ts";

const GROUP_BY_OPTIONS = ["src_ip", "user", "host", "event_type", "source"] as const;
const TEST_WINDOW_DAYS = 7; // ตรงกับ retention จริงของระบบ (7 วัน) — ทดสอบเกินนี้ไม่มีข้อมูลให้ดูอยู่แล้ว

interface Props {
  tenants: string[];
  onCreated: () => void;
}

const inputClass =
  "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30";

export function RuleForm({ tenants, onCreated }: Props) {
  const [tenant, setTenant] = useState(tenants[0] ?? "");
  const [name, setName] = useState("");
  const [action, setAction] = useState("");
  const [eventTypeContains, setEventTypeContains] = useState("");
  const [windowMinutes, setWindowMinutes] = useState(5);
  const [threshold, setThreshold] = useState(3);
  const [groupBy, setGroupBy] = useState<string[]>(["src_ip"]);
  const [channel, setChannel] = useState<Channel>("ui");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [emailTo, setEmailTo] = useState("");

  const testRule = useTestRule();
  const createRule = useCreateRule();

  function buildCondition(): AlertCondition {
    return {
      action: action || undefined,
      event_type_contains: eventTypeContains || undefined,
      window_minutes: windowMinutes,
      threshold,
      group_by: groupBy as AlertCondition["group_by"],
    };
  }

  function handleTest() {
    if (groupBy.length === 0) return;
    const now = new Date();
    testRule.mutate({
      tenant,
      condition: buildCondition(),
      from: new Date(now.getTime() - TEST_WINDOW_DAYS * 86_400_000).toISOString(),
      to: now.toISOString(),
    });
  }

  async function handleSave() {
    if (groupBy.length === 0 || !name) return;
    await createRule.mutateAsync({
      tenant,
      name,
      condition: buildCondition(),
      channel,
      channel_config: channel === "webhook" ? { url: webhookUrl } : channel === "email" ? { to: emailTo } : {},
    });
    setName("");
    testRule.reset();
    onCreated();
  }

  function toggleGroupBy(field: string) {
    setGroupBy((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-sm font-medium text-slate-700">สร้าง rule ใหม่</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tenants.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Tenant
            <select value={tenant} onChange={(e) => setTenant(e.target.value)} className={inputClass}>
              {tenants.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          ชื่อ rule
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Repeated failed login" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          action (ตรงเป๊ะ, เว้นว่างได้)
          <input value={action} onChange={(e) => setAction(e.target.value)} className={inputClass} placeholder="deny" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          event_type มีคำว่า
          <input
            value={eventTypeContains}
            onChange={(e) => setEventTypeContains(e.target.value)}
            className={inputClass}
            placeholder="login"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          window (นาที)
          <input
            type="number"
            min={1}
            value={windowMinutes}
            onChange={(e) => setWindowMinutes(Number(e.target.value))}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          threshold
          <input type="number" min={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          แจ้งเตือนทาง
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={inputClass}>
            <option value="ui">UI เท่านั้น</option>
            <option value="webhook">Webhook</option>
            <option value="email">Email</option>
          </select>
        </label>
        {channel === "webhook" && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Webhook URL
            <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className={inputClass} placeholder="https://..." />
          </label>
        )}
        {channel === "email" && (
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            ส่งถึง (email)
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className={inputClass}
              placeholder="admin@demoa.local"
            />
          </label>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-500">group by (เลือกอย่างน้อย 1)</p>
        <div className="flex flex-wrap gap-3">
          {GROUP_BY_OPTIONS.map((field) => (
            <label key={field} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={groupBy.includes(field)} onChange={() => toggleGroupBy(field)} />
              {field}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={testRule.isPending || groupBy.length === 0}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
        >
          {testRule.isPending ? "กำลังทดสอบ..." : `ทดสอบกับ log ${TEST_WINDOW_DAYS} วันล่าสุด`}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={createRule.isPending || groupBy.length === 0 || !name}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
        >
          {createRule.isPending ? "กำลังบันทึก..." : "บันทึก rule"}
        </button>
      </div>

      {testRule.data && <TestResults matches={testRule.data.matches} />}
      {testRule.isError && <p className="text-sm text-red-600">ทดสอบไม่สำเร็จ</p>}
    </div>
  );
}

function TestResults({ matches }: { matches: TestMatch[] }) {
  if (matches.length === 0) {
    return <p className="text-sm text-slate-500">ไม่พบข้อมูลที่ตรงเงื่อนไขใน log ย้อนหลัง</p>;
  }
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-xs text-slate-500">ผลทดสอบ — จำลองว่าถ้าใช้เงื่อนไขนี้จริงจะเห็นอะไรบ้าง (ยังไม่บันทึก)</p>
      <ul className="space-y-1 text-sm">
        {matches.map((m, i) => (
          <li key={i} className="flex items-center justify-between">
            <span className="text-slate-700">{Object.entries(m.group).map(([k, v]) => `${k}=${v}`).join(", ")}</span>
            <span className="flex items-center gap-1.5">
              <span className="tabular-nums text-slate-500">{m.hits} ครั้ง</span>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{
                  color: m.would_trigger ? STATUS.critical : STATUS.good,
                  backgroundColor: m.would_trigger ? `${STATUS.critical}22` : `${STATUS.good}22`,
                }}
              >
                {m.would_trigger ? "จะ trigger" : "ไม่ถึง threshold"}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
