import { z } from "zod";

/**
 * Canonical log event schema — the single source of truth for the `logs` table shape.
 * Vector (VRL) is the only writer of this table; this schema has no runtime effect on
 * Vector. It exists so CI can validate `vector test` output against the same contract
 * the backend/frontend rely on (see /tests/contract).
 *
 * Must stay in lockstep with db/migrations/001_init.sql — every NOT NULL column here
 * is required because Postgres DEFAULTs do not apply to rows inserted by the Vector
 * postgres sink (jsonb_populate_recordset bypasses column defaults).
 */
export const SourceEnum = z.enum([
  "firewall",
  "network",
  "api",
  "crowdstrike",
  "aws",
  "m365",
  "ad",
  "parse_error",
]);

const ipOrNull = z
  .string()
  .refine(
    (v) => /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[0-9a-fA-F:]+$/.test(v),
    "must be a valid IPv4/IPv6 address"
  )
  .nullable()
  .optional();

export const CanonicalEvent = z.object({
  event_id: z.string().uuid(),
  ts: z.string().datetime({ offset: true }),
  ingested_at: z.string().datetime({ offset: true }),
  tenant: z.string().min(1),
  source: SourceEnum,
  event_type: z.string().min(1),
  event_subtype: z.string().nullable().optional(),
  severity: z.number().int().min(0).max(10),
  // free-form on purpose: sample data (e.g. CrowdStrike "quarantine") doesn't fit a
  // fixed allow|deny|create|delete|login|logout|alert enum — see FullStack Inturn.pdf §3
  action: z.string().min(1),
  src_ip: ipOrNull,
  dst_ip: ipOrNull,
  user: z.string().nullable().optional(),
  host: z.string().nullable().optional(),
  attrs: z.record(z.unknown()),
  raw: z.string().nullable().optional(),
  tags: z.array(z.string()),
});

export type CanonicalEvent = z.infer<typeof CanonicalEvent>;

/**
 * รูปร่างของ alert_rules.condition (JSONB) — ทั้ง backend (validate ตอน
 * POST/PATCH /rules) และ worker (validate ตอนอ่าน rule มาประเมินผล) ต้องเชื่อ
 * สัญญาเดียวกันนี้ ไม่งั้น backend ยอมให้ rule รูปร่างหนึ่งผ่าน แต่ worker คาด
 * หวังอีกรูปร่างหนึ่ง แล้ว evaluator พังเงียบๆ
 *
 * group_by จำกัดเป็น enum ของคอลัมน์ที่อนุญาตเท่านั้น — worker เอาค่านี้ไปต่อ
 * เป็น SQL "GROUP BY <column>" ตรงๆ ถ้าไม่ล็อกด้วย enum ตรงนี้ admin ที่สร้าง
 * rule เองก็ยัด SQL injection ผ่านช่องนี้ได้
 */
export const AlertCondition = z.object({
  action: z.string().optional(),
  event_type_contains: z.string().optional(),
  window_minutes: z.number().int().min(1).max(1440),
  threshold: z.number().int().min(1),
  group_by: z.array(z.enum(["src_ip", "user", "host", "event_type", "source"])).min(1),
});

export type AlertCondition = z.infer<typeof AlertCondition>;
