import { useState, type FormEvent, type ReactNode } from "react";
import { SourceEnum } from "@log-platform/shared";
import type { SearchFilters } from "../api/search.ts";

interface Props {
  initial: SearchFilters;
  tenants: string[];
  onApply: (filters: SearchFilters) => void;
}

const inputClass =
  "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}

// ฟอร์มแบบ draft-state + ปุ่ม Search แทนที่จะยิง request ทุกครั้งที่พิมพ์
// (debounce ต่อ keystroke ซับซ้อนเกินความจำเป็นสำหรับ scope นี้) — filter ที่
// applied แล้วจริงอยู่ใน URL (Search.tsx เป็นคนเขียน) ไม่ใช่ state ในฟอร์มนี้
export function SearchFiltersBar({ initial, tenants, onApply }: Props) {
  const [draft, setDraft] = useState<SearchFilters>(initial);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onApply(draft);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card"
    >
      {/* ซ่อน tenant selector ถ้า user มี tenant เดียว — ตามที่ design doc ระบุ:
          "Viewer จะไม่เห็น dropdown เลือก tenant เลย เพราะมี tenant เดียว" */}
      {tenants.length > 1 && (
        <Field label="Tenant">
          <select
            value={draft.tenant ?? ""}
            onChange={(e) => setDraft({ ...draft, tenant: e.target.value || undefined })}
            className={inputClass}
          >
            <option value="">ทั้งหมด</option>
            {tenants.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* กลับมาเป็น dropdown ตามที่ขอ — backend ยังเป็น ILIKE substring เหมือนเดิม
          (ดู logs/repository.ts) แค่ dropdown เลือกได้แค่ค่าตรงเป๊ะจาก enum
          เท่านั้น ซึ่งก็ยังแมตช์ผ่าน ILIKE ได้ปกติ (ค่าตรงเป๊ะก็เป็น substring
          ของตัวเองอยู่แล้ว) เลือกง่ายกว่าพิมพ์เอง ไม่มีทางพิมพ์ผิด/สะกดผิด */}
      <Field label="Source">
        <select
          value={draft.source ?? ""}
          onChange={(e) => setDraft({ ...draft, source: e.target.value || undefined })}
          className={inputClass}
        >
          <option value="">ทั้งหมด</option>
          {SourceEnum.options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Event type">
        <input
          value={draft.event_type ?? ""}
          onChange={(e) => setDraft({ ...draft, event_type: e.target.value || undefined })}
          className={inputClass}
        />
      </Field>

      <Field label="Source IP">
        <input
          value={draft.src_ip ?? ""}
          onChange={(e) => setDraft({ ...draft, src_ip: e.target.value || undefined })}
          className={inputClass}
        />
      </Field>

      <Field label="Min severity">
        <input
          type="number"
          min={0}
          max={10}
          value={draft.severity_min ?? ""}
          onChange={(e) => setDraft({ ...draft, severity_min: e.target.value ? Number(e.target.value) : undefined })}
          className={`${inputClass} w-20`}
        />
      </Field>

      <Field label="ค้นหา (raw / user / host)">
        <input
          value={draft.q ?? ""}
          onChange={(e) => setDraft({ ...draft, q: e.target.value || undefined })}
          className={`${inputClass} w-48`}
        />
      </Field>

      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
      >
        Search
      </button>
    </form>
  );
}
