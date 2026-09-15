# ติดตั้งโหมด Appliance (เครื่องเดียว/VM เดียว)

## 1) ข้อกำหนดเครื่อง (ขั้นต่ำ)

- Ubuntu 22.04+ (หรือ Linux distro อื่นที่รัน Docker ได้ — วิธีนี้ทดสอบบน Windows
  + Docker Desktop ได้เหมือนกัน แค่คำสั่งบางอันต้องปรับเป็น syntax ของ shell
  ที่ใช้
- 4 vCPU, 8 GB RAM, 40 GB disk
- เปิดพอร์ตที่จำเป็น (ดูหัวข้อ 5 — เฉพาะเวลาต้องรับ log จากเครื่องอื่นในวงแลน/
  syslog จากอุปกรณ์จริง)
- ติดตั้ง Docker Engine + Docker Compose plugin ไว้แล้ว

## 2) Clone repo

```bash
git clone <URL ของ repo นี้>
cd log
```

## 3) ขึ้นระบบด้วยคำสั่งเดียว

```bash
make up
```

คำสั่งนี้ทำ 3 อย่างต่อกันอัตโนมัติ (อ่านจาก `Makefile` เป้าหมาย `up`):

1. **`make env`** (เรียกผ่าน dependency `check-secrets`) — ถ้ายังไม่มีไฟล์ `.env`
   จะ copy จาก `.env.example` แล้ว generate ค่า `POSTGRES_PASSWORD`,
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` แบบสุ่มให้เองด้วย `openssl rand`
   (ถ้ามี `.env` อยู่แล้วจะข้ามขั้นตอนนี้ ไม่ทับของเดิม)
2. **`docker compose up -d --build --wait`** — build image ของ `api`/`worker`/
   `frontend` แล้วรันทุก service เบื้องหลัง รอจนกว่า healthcheck ของ postgres
   ผ่านก่อนค่อยคืน prompt กลับมา (กัน seed วิ่งชนจังหวะที่ postgres ยังไม่พร้อม)
3. **`make seed`** — insert ข้อมูลตั้งต้น (tenant demoA/demoB, user demo, api key
   demo, ตัวอย่าง alert rule 1 ตัว) จาก `db/seed/seed.sql` — รันซ้ำได้เรื่อยๆ
   ไม่สร้างข้อมูลซ้ำ (idempotent)

ใช้เวลาประมาณ 2-5 นาทีขึ้นกับความเร็วเครื่อง/เน็ต 
## 4) เปิดใช้งาน

เปิด browser ไปที่ **`https://localhost/`** (หรือ IP ของเครื่องถ้าเข้าจากเครื่องอื่นในวงแลน)

Browser จะเตือน **"การเชื่อมต่อนี้ไม่เป็นส่วนตัว" / "ไม่ปลอดภัย"** ครั้งแรกเสมอ —
เป็นเรื่องปกติ ไม่ใช่ระบบพัง เพราะ Caddy ออก TLS certificate เองแบบ self-signed
จาก internal CA ของมันเอง  ถ้าอยากเอาคำเตือนออก ให้ใช้คำสั่ง  
```bash
make trust-cert
```

จะดึง root CA certificate ของ Caddy ออกมาเป็นไฟล์ `caddy-root-ca.crt` ที่ root
repo — จากนั้น import เข้า trust store ของ OS/browser เอง วิธี import ต่างกัน
ตาม OS:

- **Windows**: ดับเบิลคลิกไฟล์ `caddy-root-ca.crt` → "Install Certificate" →
  เลือก "Local Machine" → "Place all certificates in the following store" →
  Browse เลือก **"Trusted Root Certification Authorities"** → Finish → รี
  สตาร์ท browser
- **macOS**: ดับเบิลคลิกไฟล์เพื่อเปิดใน Keychain Access → หา certificate ที่
  import เข้าไป (ชื่อจะขึ้นต้นด้วย "Caddy") → double click → ขยาย "Trust" →
  ตั้ง "When using this certificate" เป็น **"Always Trust"**
- **Linux (Ubuntu/Debian)**:
  ```bash
  sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/caddy-root-ca.crt
  sudo update-ca-certificates
  ```
  (Firefox มี trust store แยกของตัวเอง ต้อง import เพิ่มผ่าน
  Settings → Privacy & Security → Certificates → View Certificates → Import)

## 5) พอร์ตที่ต้องเปิด (ถ้าจะให้เครื่อง/อุปกรณ์อื่นในวงแลนยิง log เข้ามาได้)

| พอร์ต | โปรโตคอล | ใช้ทำอะไร | จำเป็นแค่ไหน |
|---|---|---|---|
| 443 | TCP | เว็บ UI + API (`/api/*`) + HTTP ingest (`/ingest`) ผ่าน HTTPS | บังคับ |
| 80 | TCP | redirect ไป 443 อัตโนมัติ | บังคับ |
| 5514 | UDP + TCP | syslog จาก firewall/router จริง (ไม่ผ่าน Caddy — เข้าตรง Vector เลย เพราะ Caddy คุย syslog ดิบไม่ได้) | ต้องเปิดถ้าจะรับ syslog จากอุปกรณ์จริง |
| 9598 | TCP | `/metrics` ของ Vector (Prometheus scrape) | ไม่บังคับ — เฉพาะทีม ops ที่จะ monitor เอง |
| 8025 | TCP | Mailhog web UI (ดูอีเมล alert ที่ "ส่งแล้ว" ตอน dev/demo) | ไม่บังคับ — dev/demo เท่านั้น ไม่ใช่ของ production |

พอร์ต `5433` (postgres) และ `5173` (frontend dev server ตรงๆ) **ไม่ควรเปิดออก
สู่ภายนอกเลย** แม้ docker-compose จะ publish ไว้ก็ตาม — สองพอร์ตนี้มีไว้สำหรับ
debug จากเครื่อง host เอง (เช่นต่อ psql client เข้า postgres โดยตรงตอน dev)
เท่านั้น ถ้าเป็นเครื่อง appliance ที่ต่อ internet ให้ปิดที่ระดับ host
firewall/router (`ufw`, security group ฯลฯ) ไว้เสมอ

