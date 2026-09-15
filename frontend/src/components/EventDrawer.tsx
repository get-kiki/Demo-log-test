import { useState } from "react";
import type { CanonicalEvent } from "@log-platform/shared";
import { SourceBadge } from "./SourceBadge.tsx";
import { SeverityBadge } from "./SeverityBadge.tsx";

interface Props {
  event: CanonicalEvent | null;
  onClose: () => void;
}

const FIELD_ROWS: { key: keyof CanonicalEvent; label: string }[] = [
  { key: "event_id", label: "Event ID" },
  { key: "ts", label: "Timestamp" },
  { key: "ingested_at", label: "Ingested at" },
  { key: "tenant", label: "Tenant" },
  { key: "event_type", label: "Event type" },
  { key: "event_subtype", label: "Event subtype" },
  { key: "action", label: "Action" },
  { key: "src_ip", label: "Source IP" },
  { key: "dst_ip", label: "Destination IP" },
  { key: "user", label: "User" },
  { key: "host", label: "Host" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-100"
    >
      {copied ? "คัดลอกแล้ว" : "Copy"}
    </button>
  );
}

export function EventDrawer({ event, onClose }: Props) {
  if (!event) return null;

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-card-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SourceBadge source={event.source} />
            <SeverityBadge severity={event.severity} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <dl className="space-y-2 text-sm">
          {FIELD_ROWS.map(({ key, label }) => {
            const value = event[key];
            if (value === null || value === undefined || value === "") return null;
            return (
              <div key={key} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right text-slate-800">{String(value)}</dd>
              </div>
            );
          })}
          {event.tags.length > 0 && (
            <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
              <dt className="text-slate-500">Tags</dt>
              <dd className="text-right text-slate-800">{event.tags.join(", ")}</dd>
            </div>
          )}
        </dl>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm text-slate-500">attrs</p>
            <CopyButton text={JSON.stringify(event.attrs, null, 2)} />
          </div>
          <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
            {JSON.stringify(event.attrs, null, 2)}
          </pre>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm text-slate-500">raw</p>
            <CopyButton text={event.raw ?? ""} />
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">
            {event.raw ?? "(ไม่มี raw — event ถูก drop ก่อนจะเซ็ต raw)"}
          </pre>
        </div>
      </aside>
    </>
  );
}
