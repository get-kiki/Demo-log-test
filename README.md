# Demo Log Management Platform

ระบบรับ log จากหลายแหล่ง (firewall, network, API ภายใน, CrowdStrike, AWS, Microsoft 365, Active Directory) แปลงให้อยู่ใน schema กลางเดียวกัน เก็บให้ค้นหาได้เร็ว มีหน้าจอสรุปภาพรวม (Top IP/User/Event type, Timeline) และตั้งกฎแจ้งเตือนอัตโนมัติได้เวลามีอะไรผิดปกติ เช่น IP เดิม login ผิดซ้ำๆ ภายในไม่กี่นาที

ทำโจทย์ตาม `docs/architecture.md` เป็นระบบ multi-tenant (ข้อมูลของแต่ละลูกค้าไม่ปนกัน) และรองรับติดตั้งได้ทั้ง **Appliance** (เครื่อง/VM เดียว) และ **SaaS/Cloud** (มี URL ให้เข้าจากภายนอกผ่าน HTTPS)

## เทคโนโลยีที่ใช้

| ส่วน | ใช้อะไร | เพราะอะไร (สรุป — เหตุผลเต็มอยู่ใน `docs/architecture.md`) |
|---|---|---|
| Ingest | [Vector](https://vector.dev) | รองรับหลาย source/sink ในตัว, มี VRL แปลง log ได้เร็ว, มี disk buffer กัน event หายตอน restart |
| Storage | PostgreSQL + JSONB/GIN | คอลัมน์จริงสำหรับ field ที่ query บ่อย + JSONB สำหรับ field ปลีกย่อยที่ไม่ fix โครงสร้าง ไม่ต้องเพิ่ม infra แยก |
| Backend | Fastify + Zod + TypeScript | schema เดียวทำทั้ง validate request และ serialize response |
| Frontend | React + TanStack Query + Vite | จัดการ cache/refetch/pagination ให้เกือบหมด |
| Reverse proxy | Caddy | automatic HTTPS ในตัว ทั้ง self-signed (appliance) และ Let's Encrypt (SaaS) |
| Packaging | Docker Compose | config เดียวรันได้ทั้ง appliance และขยายเป็น SaaS ด้วย override ไฟล์เดียว |

## เริ่มใช้งาน (โหมด Appliance)

ต้องมี Docker Engine + Docker Compose plugin

```bash
git clone <URL ของ repo นี้>
cd log
make up
```

คำสั่งเดียวจบ: สร้าง `.env` พร้อม secret แบบสุ่มให้เอง (ถ้ายังไม่มี) → build + up ทุก service → seed ข้อมูลตัวอย่างให้อัตโนมัติ ใช้เวลาประมาณ 2-5 นาที

เปิด **`https://localhost/`** (browser จะเตือน self-signed certificate ครั้งแรก เป็นเรื่องปกติ — ดูวิธีเอาคำเตือนออกใน `docs/setup_appliance.md`)

บัญชีทดสอบ (admin/viewer ของ `demoA`/`demoB` + API key สำหรับยิง `/ingest`) อยู่ที่ [`docs/IDand password.md`](docs/IDand%20password.md)

ขั้นตอนละเอียด รวมถึงพอร์ตที่ต้องเปิดถ้าจะรับ log จากอุปกรณ์จริง: [`docs/setup_appliance.md`](docs/setup_appliance.md)

## Deploy โหมด SaaS/Cloud

รันบน service เดียวกันทุกตัว ต่างแค่ Caddy ขอ TLS certificate จริงจาก Let's Encrypt แทน self-signed — ต้องมี cloud VM + domain ชี้ DNS มาก่อน ดูขั้นตอนเต็มที่ [`docs/setup_saas.md`](docs/setup_saas.md)

```bash
make saas-up
```

## โครงสร้างโปรเจกต์

```
backend/          Fastify API — auth, search, stats, rules, alerts, /internal/verify-key
worker/           ประเมิน alert rule ทุก 60 วินาที + ดูแล partition ของตาราง logs
frontend/         React SPA — Overview, Search, Alerts, Rules
vector/           ingest pipeline (sources -> envelope -> route -> parse_<source> -> sinks)
db/migrations/    schema + partition (รันอัตโนมัติตอนสร้าง Postgres container ครั้งแรก)
db/seed/          ข้อมูล demo (tenant/user/api key/alert rule ตัวอย่าง) — รันมือผ่าน `make seed`
packages/shared/  Zod schema กลาง (CanonicalEvent, AlertCondition) ที่ backend/worker/frontend ใช้ร่วมกัน
samples/          สคริปต์จำลองการส่ง log เข้าระบบ (syslog / HTTP API / file batch)
tests/            unit + integration test (ฝั่ง TypeScript)
docs/             สถาปัตยกรรม, วิธีติดตั้งทั้ง 2 โหมด, บัญชีทดสอบ, diagram
```

## ทดสอบส่ง log เข้าระบบ

```bash
# syslog ผ่าน UDP/TCP (port 5514) — ตัวอย่าง firewall + network
./samples/send_syslog.sh

# HTTP JSON ผ่าน /ingest (ทั้ง 5 source: api, crowdstrike, aws, m365, ad) — ยิงตัวอย่างคงที่ครั้งเดียวแล้วจบ
python samples/post_logs.py

# File batch — เขียนไฟล์ .ndjson ลง spool/ ให้ Vector อ่านเอง
python samples/make_batch_file.py

# ยิงต่อเนื่องไปเรื่อยๆ (สุ่มค่าทุกรอบ) จนกว่าจะกด Ctrl+C — เหมาะตอนอัดวิดีโอเดโม/เปิด
# dashboard ทิ้งไว้ดูตัวเลขขยับสดๆ ทุก 15 รอบ (ปรับได้) จะแทรก login-fail จาก IP เดิม
# รัว 3 ครั้ง ให้เห็น alert เกิดขึ้นจริงด้วย
python samples/stream_logs.py
```

เช็คผลได้ที่หน้า Search ภายใน 1 นาที (ดู `db/migrations` เรื่อง batch insert ทุก 20 event/10ms ของ Vector)

## รันเทส

| คำสั่ง | เทสอะไร | ต้องมีอะไรก่อน |
|---|---|---|
| `npm test` | RBAC/Tenant isolation (`resolveTenants`, `searchLogs`) | ไม่ต้องมีอะไร รันได้ทันที |
| `npm run test:integration` | Alert evaluator เกิด alert จริงเมื่อ log ตรงเงื่อนไข rule (`Repeated failed login`) | ต้องมี Postgres รันอยู่ + seed แล้ว (`docker compose up -d postgres --wait && make seed`) |
| `docker compose run --rm --no-deps vector test --config-dir /etc/vector` | Normalize ของทั้ง 7 source + dead-letter path (ฝั่ง Vector/VRL) | ต้องเปิด Docker Desktop |

## เอกสารเพิ่มเติม

- [`docs/architecture.md`](docs/architecture.md) — data flow, tenant model, เหตุผลการเลือกเทคโนโลยีแต่ละตัว
- [`docs/setup_appliance.md`](docs/setup_appliance.md) — ติดตั้งโหมด Appliance แบบละเอียด
- [`docs/setup_saas.md`](docs/setup_saas.md) — ติดตั้งโหมด SaaS/Cloud แบบละเอียด
- [`docs/IDand password.md`](docs/IDand%20password.md) — บัญชี/API key ทดสอบ
