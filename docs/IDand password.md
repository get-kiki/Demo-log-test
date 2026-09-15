# Demo Accounts

บัญชีทดสอบที่มาจาก `db/seed/seed.sql` — รันแล้วครั้งเดียวตอน seed database เห็นได้ในตาราง `users`
เปลี่ยนก่อนใช้งานจริงเสมอ (นี่คือรหัสผ่านสำหรับ dev/demo เท่านั้น)

| Email | Password | Role | Tenant |
|---|---|---|---|
| `admin@demoa.local` | `admin1234` | admin | demoA |
| `viewer@demoa.local` | `viewer1234` | viewer | demoA |
| `admin@demob.local` | `admin1234` | admin | demoB |
| `viewer@demob.local` | `viewer1234` | viewer | demoB |

# Demo API Keys (POST /ingest)

`/ingest` เช็ค API key ก่อนเสมอ (Caddy `forward_auth` → `backend/src/routes/internal.ts`
→ ตาราง `api_keys`) — ยิงเข้ามาโดยไม่แนบ header `X-Api-Key` หรือแนบ key ผิด จะได้
`401` กลับมาทันที **ก่อน** ถึง Vector ด้วยซ้ำ (log ไม่มีทางหลุดเข้าระบบ)

| Tenant | API Key (ใส่ใน header `X-Api-Key`) |
|---|---|
| demoA | `demoA-dev-key-000` |
| demoB | `demoB-dev-key-000` |

ตัวอย่างทดสอบด้วย curl (โหมด appliance ใช้ self-signed cert เอง ต้องเติม `-k`
ถ้ายังไม่ได้ `make trust-cert`):

```bash
curl -k https://localhost/ingest \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: demoA-dev-key-000" \
  -d '{"tenant":"demoA","source":"api","event_type":"app_login_failed","user":"alice","ip":"203.0.113.7","reason":"wrong_password","@timestamp":"2025-08-20T07:20:00Z"}'
```

ทดสอบง่ายกว่านั้นได้ด้วย `python samples/post_logs.py` — สคริปต์ใส่ key ให้เองแล้ว
ไม่ต้องพิมพ์อะไรเพิ่ม (ดูตาราง key ด้านบนถ้าจะยิงเองด้วยมือแทน)

ค่าเหล่านี้ (ทั้ง key และ password ด้านบน) มาจาก `db/seed/seed.sql` ล้วนๆ เป็นค่า
เดโม/dev เท่านั้น เปลี่ยนก่อนใช้งานจริงเสมอเช่นเดียวกัน