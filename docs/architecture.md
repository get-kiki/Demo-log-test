architecture 
Demo ระบบ Log Management
ระบบนี้ืทำอะไร รับ log จากหลายแหล่งเข้ามาที่เดียว (firewall, API, CrowdStrike, AWS, Microsoft 365, Active Directory) แปลงให้อยู่ในรูปแบบเดียวกันหมด เก็บไว้ให้ค้นหาได้เร็ว มีหน้าจอสรุปภาพรวมให้ดู (เช่น IP ไหนน่าสงสัยที่สุด, event ประเภทไหนเยอะสุดตอนนี้) แล้วก็ตั้งกฎให้มันเตือนอัตโนมัติได้เวลามีอะไรผิดปกติ เช่น IP เดิม login ผิดรัวๆ ก็แจ้งเตือนทันทีโดยไม่ต้องรอคนมานั่งไล่ดูเอง

ดูแผนภาพประกอบได้ที่ docs/Architechture Diagram.png


1.vector ทำหน้าที่รับ log มาจากหลายแหล่ง และแปลงlog เข้าสู่ schema กลาง และส่งต่อไปยัง postgreSql
กระบวนการทำงาน 
-envelope.toml รับ logs จากแหล่งต่างๆ( TCP,UDP/API/file) และ เติม received_at และเดา "แหล่งที่มา"ส่งไปที่
-route_by_source.toml  แยก log ที่ผ่าน envelope มาแล้วออกเป็น "เลน" ตามประเภทแหล่งที่มา (ตอนนี้มี 7 เลน: firewall, network, api, crowdstrike, aws, m365, ad)
-parse_<source>.toml แปลง log ดิบของแต่ละแหล่งให้เข้ากับ schemaกลางเดียวกัน field ที้ไม่มีคอลัมน์เฉพาะ เช่น vendor,port,protocol จะถูกใส่ไว้ใน attrs แทน เพราะมันไม่ใช่ field ที่ใช่รวมกันทุก source ใช้แค่บางตัวเท่านั้น แต่ ข้อมูลไม่ได้หายไปไหนยังอยู่ใน attrs 
-ถ้า parse ไม่ผ่าน แปลงไม่สำเร็จ จะเก็บ raw เต็มๆ ไว้เป็นไฟล์dead-letter  และแปลงย่อออกมาเป็น sourece ใหม่ ชื่อ parse_error แล้วส่งไปยัง logs (ให้เห็นใน dashdoard ว่ามีปัญหาอะไร)

-sinks.toml เป็นจุดสุดท้ายของ pipeline ส่ง log ที่แปลงเสร็จแล้วเข้า PostgreSQL เป็นชุด (batch ละ 20 event หรือทุก 10ms แล้วแต่ตัวไหนถึงก่อน) ไม่ใช่ทีละแถว เพื่อความเร็ว

2.postgres ทำหน้าที่เก็บข้อมูล log ทั้งหมดที่ vector ส่งเข้ามา ให้ค้นหาได้เร็วและถูกต้อง

-schema กลาง field หลักที่ query บ่อยเป็นคอลัมน์จริง: event_id, ts, ingested_at, tenant, source, event_type, severity, action, src_ip, dst_ip, user, host ส่วน field ปลีกย่อยที่ไม่ได้ใช้ร่วมกันทุก source (vendor, port, protocol, cloud.* ฯลฯ) ยัดรวมไว้ใน attrs (JSONB) แทน ยังค้นหาลึกเข้าไปได้อยู่ผ่าน GIN index (attrs jsonb_path_ops) แค่ช้ากว่าคอลัมน์ตรงๆ เล็กน้อย

-partition 2 ชั้น ตาราง logs แบ่งเป็นก้อนย่อยตามวันก่อน แล้วในแต่ละวันแบ่งย่อยอีกทีตาม tenant
  -ชั้น 1 แบ่งตามวัน: ทำให้ retention (ขั้นต่ำ 7 วัน) เป็นแค่ DROP TABLE ของวันเก่าทิ้งทั้งก้อน ไม่ต้อง DELETE ทีละแถวซึ่งช้า
  -แบ่งตาม tenant ในแต่ละวันอีกชั้น: แยกพื้นที่เก็บข้อมูลจริงระหว่าง tenant ไม่ใช่แค่กรองด้วย where clause เฉยๆ tenant หนึ่งทำงานหนักไม่กระทบอีก tenant 

-index ทุกตัวบนตาราง logs ขึ้นต้นด้วย tenant เสมอ (เช่น (tenant, ts DESC), (tenant, source, ts DESC)) เพราะทุก query จริงกรองด้วย tenant ก่อนเป็นอันดับแรกอยู่แล้ว

-หน้า search ใช้ keyset pagination (cursor เข้ารหัสจาก ts + event_id) แทน OFFSET เพราะยังใช้ index ของ primary key สแกนต่อได้เลย ไม่ต้องนับข้ามแถวเหมือน OFFSET ตอนข้อมูลเยอะๆ



tenant model ระบบนี้เป็น multi-tenant คือฐานข้อมูล/โค้ดชุดเดียวกันรองรับลูกค้าหลายราย (tenant) พร้อมกัน เช่น demoA กับ demoB แต่ข้อมูลของแต่ละ tenant ต้องไม่ปนกัน

แยกการป้องกัน 2 ชั้น:
-ชั้นเก็บข้อมูล (storage) partition ตาราง logs แยกเป็นตารางจริงต่อ tenant ไม่ใช่แค่คอลัมน์กรอง
-ชั้นแอป (application) ทุก endpoint ที่แตะ logs ต้องเช็คผ่านฟังก์ชันจุดเดียวชื่อ resolveTenants ว่า user มีสิทธิ์เห็น tenant ไหนบ้าง (เก็บไว้ใน JWT ตอน login) ขอ tenant ที่ไม่มีสิทธิ์ตอบ 403 ทันที

สาเหตุที่ออกแบบแบบนี้คือ อยากได้ความปลอดภัยกันข้อมูลรั่วข้ามกันระหว่าง tenant ความสะดวกในการดูแลระบบ (จริงๆอยากลองลองออกแบบ แบบ RLS อยู่นะครับ แต่ผมมองว่าตอนนีี้มมันเป็น demo อยู่ครับ ซึง่มันยังไม่ tenant น้อยอยู่ แบบ RLS )

tech stack ที่ใช้

-Ingest: Vector รองรับหลาย source/sink ในตัว (socket, http_server, file) มี VRL เป็น DSL แปลง log ได้เร็ว  แถมมี buffer แบบ disk กัน event หายตอน restart ในตัวอยู่แล้ว

-Storage: PostgreSQL + JSONB/GIN ตัวเดียวรองรับทั้งคอลัมน์ปกติ (query เร็วด้วย btree) และ field ที่ไม่ fix โครงสร้าง (ผ่าน GIN) ไม่ต้องเพิ่ม infra แยกแบบ OpenSearch/ClickHouse ที่ต้อง maintain cluster เพิ่มอีกตัว แถม native partition ของ Postgres พอสำหรับ retention/tenant isolation ที่ต้องการอยู่แล้ว

-Backend: Fastify + Zod + TypeScript schema ตัวเดียวทำทั้ง validate request และ serialize response ลด bug จาก response ไม่ตรง type throughput ของ Fastify สูงกว่า Express

-Frontend: React + TanStack Query + Vite ตัว TanStack Query จัดการ cache/refetch/pagination ให้เกือบหมด ลดโค้ด state management เอง 

-Reverse proxy: Caddy มี automatic HTTPS ในตัว (ทั้ง self-signed กับ Let's Encrypt) ไม่ต้องตั้ง TLS เองแยก 2 ระบบแบบ nginx+certbot
-Packaging: Docker Compose รันได้บนเครื่องเดียวตรงตามข้อกำหนด appliance และ config เดียวขยายไป SaaS ได้ด้วยการเพิ่มไฟล์ override