# ติดตั้งโหมด SaaS/Cloud (มี URL จริงให้เข้าจากภายนอก)

โหมดนี้รัน service เดียวกันเป๊ะกับโหมด Appliance ทุกตัว ต่างกันแค่ชั้น TLS ของ
Caddy — เปลี่ยนจากออก certificate เองแบบ self-signed เป็นขอจาก **Let's
Encrypt** จริงผ่าน ACME (ดูรายละเอียดเชิงเทคนิคที่
[`docs/architecture.md`](./architecture.md)) ตรงตามข้อสอบข้อ 2.2: "SaaS/Cloud:
รันบนคลาวด์สาธารณะ มี URL ให้กรรมการเข้าใช้งาน" + "TLS: เปิดใช้งาน HTTPS อย่าง
น้อยในโหมด SaaS"

## 1) เตรียม Cloud VM

เลือก provider อะไรก็ได้ (DigitalOcean, AWS EC2, GCP Compute Engine, Vultr,
Azure ฯลฯ) — สร้าง VM ตามสเปกขั้นต่ำของข้อสอบ (ข้อ 5):

- Ubuntu 22.04+
- 4 vCPU, 8 GB RAM, 40 GB disk
- มี public IP (v4 อย่างน้อย)

ติดตั้ง Docker Engine + Docker Compose plugin บน VM นี้ (SSH เข้าไปรัน —
[Docker Engine install](https://docs.docker.com/engine/install/ubuntu/))

## 2) ตั้งค่า cloud firewall / security group ก่อนรัน

เปิดเฉพาะพอร์ตที่จำเป็นจริงๆ — **อย่าเปิดพอร์ตอื่นออกสู่ internet เด็ดขาด**
(โดยเฉพาะ `5433` ของ postgres และ `5173` ของ frontend dev server ตรงๆ ที่
docker-compose publish ไว้เพื่อ debug เท่านั้น ไม่ใช่สำหรับ public):

| พอร์ต | โปรโตคอล | ใช้ทำอะไร |
|---|---|---|
| 443 | TCP | เว็บ UI + API + HTTP ingest ทั้งหมด |
| 80 | TCP | ACME HTTP-01 challenge (Let's Encrypt ใช้ยืนยันว่าเป็นเจ้าของ domain จริง) + redirect ไป 443 |
| 5514 | UDP + TCP | syslog จากอุปกรณ์จริง (ถ้าต้องการรับจากภายนอก — ถ้าไม่ต้องการปิดได้เลย) |

พอร์ต 80 **ต้องเปิด** ไม่ใช่แค่ "ควรเปิด" — ถ้าปิดไว้ Let's Encrypt จะขอ
certificate ไม่สำเร็จเลยตั้งแต่ต้น (ACME HTTP-01 challenge ต้องยิงมาที่พอร์ต 80
ของ IP นี้ได้)

โหมด SaaS มี firewall **2 ชั้นที่ต้องตั้งทั้งคู่** ตั้งชั้นเดียวไม่พอ:

**ชั้นที่ 1 — ufw ข้างในตัว VM เอง** (เหมือนโหมด appliance เป๊ะ):

```bash
sudo ufw allow OpenSSH   # ทำก่อนเสมอ ไม่งั้น SSH หลุดตอน enable แล้วเข้าเครื่องไม่ได้อีกเลย
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw allow 5514/udp   # ข้ามได้ถ้าไม่ต้องรับ syslog จากภายนอก
sudo ufw allow 5514/tcp
sudo ufw enable
sudo ufw status verbose
```

**ชั้นที่ 2 — Security Group / Cloud Firewall ของ provider** (ตั้งผ่านหน้าเว็บ
console ไม่ใช่ SSH) — ตัวอย่าง AWS EC2:

1. EC2 Console → เลือก instance ของ VM นี้ → แท็บ "Security" → กดเข้า Security
   Group ที่ผูกอยู่
2. แท็บ "Inbound rules" → "Edit inbound rules" → "Add rule" ทีละแถว: Type=HTTPS
   (443), Type=HTTP (80), Custom UDP (5514), Custom TCP (5514) — Source เลือก
   "Anywhere-IPv4" (`0.0.0.0/0`)
3. Save

Provider อื่นเรียกเมนูต่างกันแต่ concept เดียวกัน: DigitalOcean = "Cloud
Firewall" (Networking → Firewalls), GCP = "Firewall rules" (VPC network →
Firewall), Azure = "Network security group" — ไปหาเมนูที่ตรงกับ provider ที่
ใช้จริงเอง

**ทั้ง 2 ชั้นต้องเปิดตรงกันเป๊ะ** — เปิดแค่ ufw แต่ Security Group ยังบล็อกอยู่
(หรือกลับกัน) ก็เข้าไม่ได้เหมือนกัน

## 3) เตรียม DNS — ต้องทำ**ก่อน**รัน docker compose เสมอ

ไปที่ DNS provider ของ domain ที่จะใช้ (เช่น Cloudflare, Namecheap, Route53)
สร้าง **A record** (และ **AAAA record** ถ้ามี IPv6) ชี้ subdomain ที่จะใช้ไปที่
public IP ของ VM ที่เพิ่งสร้าง เช่น:

```
log.yourdomain.com.   A   203.0.113.50
```

รอให้ DNS propagate ก่อน (เช็คด้วย `dig log.yourdomain.com` หรือ
`nslookup log.yourdomain.com` จากเครื่องอื่นว่าตอบ IP ที่ถูกต้องแล้ว) — ขั้นตอน
นี้พลาดบ่อยที่สุด: ถ้า DNS ยังไม่ชี้มาจริง Let's Encrypt จะขอ certificate ไม่
ผ่าน (ACME challenge ต้องเช็คได้ว่า domain นี้ชี้มาที่เครื่องที่กำลังขอ cert
จริง)

## 4) Clone repo บน VM แล้วตั้งค่า .env

```bash
git clone <URL ของ repo นี้>
cd log
make env
```

`make env` จะสร้างไฟล์ `.env` จาก `.env.example` พร้อม generate
`POSTGRES_PASSWORD`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` แบบสุ่มให้เองแล้ว
— เหลือแค่แก้ 2 บรรทัดสุดท้ายในไฟล์ `.env` ที่ `make env` ยังไม่เติมให้ (เพราะ
เป็นค่าที่ต้องมาจากพี่เอง ไม่มีทางเดาถูก):

```bash
nano .env   # หรือ editor อะไรก็ได้
```

แก้จาก:
```
SAAS_DOMAIN=log.example.com
SAAS_ACME_EMAIL=you@example.com
```
เป็นค่าจริงของพี่ เช่น:
```
SAAS_DOMAIN=log.yourdomain.com
SAAS_ACME_EMAIL=your-real-email@example.com
```

(อีเมลนี้ Let's Encrypt ใช้แจ้งเตือนถ้า certificate ใกล้หมดอายุแล้วต่ออายุ
อัตโนมัติไม่สำเร็จเท่านั้น ไม่ใช่ข้อมูลที่แสดงต่อผู้ใช้ระบบ)

## 5) ขึ้นระบบด้วยคำสั่งเดียว

```bash
make saas-up
```

ทำเหมือน `make up` ของโหมด appliance ทุกอย่าง (build + up + wait + seed) แต่มี
เช็คเพิ่ม 1 ชั้น: ถ้า `SAAS_DOMAIN`/`SAAS_ACME_EMAIL` ใน `.env` ยังเป็นค่า
placeholder เดิม (`log.example.com` / `you@example.com`) จะ **หยุดทันทีพร้อม
error message** ไม่ปล่อยให้รันต่อไปพังทีหลังแบบไม่รู้สาเหตุ — ถ้าเจอ error นี้
กลับไปทำขั้นตอนที่ 4 ให้ครบก่อน

คำสั่งจริงที่รันอยู่เบื้องหลัง (เผื่ออยากรันเองทีละขั้นตอน):

```bash
docker compose -f docker-compose.yml -f docker-compose.saas.yml up -d --build --wait
make seed
```

`-f docker-compose.saas.yml` คือตัวสั่งให้ container `caddy` ใช้
`Caddyfile.saas` แทน `Caddyfile` (appliance) — เปลี่ยนแค่ service นี้ตัวเดียว
service อื่นเหมือนกันหมด

## 6) รอ Let's Encrypt ออก certificate

ครั้งแรกที่ Caddy เห็น request เข้ามาที่ domain นี้ มันจะไปขอ certificate จาก
Let's Encrypt ให้เอง (ไม่ต้องสั่งอะไรเพิ่ม) ปกติใช้เวลาไม่กี่วินาทีถึงไม่กี่นาที
— เช็คได้ด้วย:

```bash
docker compose logs -f caddy
```

หาบรรทัดที่มีคำว่า `certificate obtained successfully` — ถ้าเจอ error แทน
(เช่น `too many redirects`, `timeout`, `could not determine zone`) ให้เช็คซ้ำ
ว่า DNS (ขั้นตอน 3) กับ firewall พอร์ต 80 (ขั้นตอน 2) ถูกต้องจริงก่อน

## 7) เข้าใช้งาน

เปิด **`https://log.yourdomain.com/`** (โดเมนจริงที่ตั้งไว้) — ควรเห็น
**กุญแจล็อคสีเขียว/ปกติ ไม่มีคำเตือนใดๆ เลย** ต่างจากโหมด appliance เพราะเป็น
certificate จริงจาก Let's Encrypt ที่ browser รู้จักอยู่แล้ว ไม่ต้อง
`make trust-cert` เหมือนโหมด appliance

login ด้วยบัญชีเดโมและทดสอบ ingest ทั้ง 3 ช่องทางแบบเดียวกับโหมด appliance —
ดู [`docs/setup_appliance.md`](./setup_appliance.md) หัวข้อ 6-7 (ขั้นตอนเหมือน
กันทุกอย่าง ต่างแค่ URL ที่ใช้) และ
[`docs/IDand password.md`](./IDand%20password.md) สำหรับบัญชี/API key เดโม —
ถ้าจะยิง `samples/post_logs.py` จากเครื่อง VM เองต้องแก้ `BASE_URL` ในสคริปต์
เป็น URL จริง (ตอนนี้ hardcode เป็น `https://localhost/ingest` สำหรับทดสอบใน
เครื่องเดียวกัน)

## 8) ส่ง URL ให้กรรมการ

`https://log.yourdomain.com/` คือ URL ที่ใช้ส่งมอบตามข้อสอบข้อ 6.3 — ไม่ต้อง
เปิด VPN หรือให้สิทธิ์อะไรเพิ่ม กรรมการเข้าจากที่ไหนก็ได้ผ่าน HTTPS ปกติ
