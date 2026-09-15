-- ============================================================
-- Seed data: ข้อมูลตั้งต้นที่ระบบต้องมีก่อนใช้งานได้จริง
-- ============================================================
-- ตั้งใจแยกจาก db/migrations/ ไม่ auto-run ตอน container สร้างครั้งแรก เพราะ
-- demo tenant/user เป็นข้อมูลสำหรับ dev/demo เท่านั้น ไม่ควรถูก seed เข้า
-- production deployment เงียบๆ โดยไม่มีใครตั้งใจ — รันมือเมื่อพร้อมด้วย:
--
--   docker exec -i <postgres-container> psql -U $POSTGRES_USER -d $POSTGRES_DB \
--     < db/seed/seed.sql
--
-- ทุก INSERT เขียนให้ idempotent (รันซ้ำกี่ครั้งก็ไม่สร้างข้อมูลซ้ำ) เพราะ dev
-- มักรันสคริปต์นี้ซ้ำหลายรอบระหว่างทดสอบ

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- ให้ crypt()/gen_salt() ใช้ hash password ได้

-- --- tenants: ตรงกับ tenant ที่ sample ทุกอันในข้อสอบใช้ ---
INSERT INTO tenants (id, name) VALUES
  ('demoA', 'Demo Tenant A'),
  ('demoB', 'Demo Tenant B')
ON CONFLICT (id) DO NOTHING;

-- --- users: 1 admin + 1 viewer ต่อ tenant ---
-- password เดโม (เปลี่ยนก่อนใช้งานจริงเสมอ): admin -> "admin1234", viewer ->
-- "viewer1234" เก็บเป็น bcrypt hash ผ่าน pgcrypto ตรงๆ ไม่ต้องพึ่ง backend
-- เพราะ seed ต้องรันได้ก่อนที่ backend จะมีด้วยซ้ำ
INSERT INTO users (email, password_hash, role, tenants) VALUES
  ('admin@demoa.local',  crypt('admin1234',  gen_salt('bf')), 'admin',  ARRAY['demoA']),
  ('viewer@demoa.local', crypt('viewer1234', gen_salt('bf')), 'viewer', ARRAY['demoA']),
  ('admin@demob.local',  crypt('admin1234',  gen_salt('bf')), 'admin',  ARRAY['demoB']),
  ('viewer@demob.local', crypt('viewer1234', gen_salt('bf')), 'viewer', ARRAY['demoB'])
ON CONFLICT (email) DO NOTHING;

-- --- api_keys: 1 key ต่อ tenant สำหรับยิงเข้า /ingest ---
-- ตาราง api_keys ไม่มี unique constraint นอกจาก id (สุ่มใหม่ทุกครั้ง) เลยใช้
-- WHERE NOT EXISTS แทน ON CONFLICT เพื่อให้ idempotent จริง
-- หมายเหตุ: http_ingest ยังไม่ตรวจสอบ key นี้เลย (ยังไม่ได้ทำ auth ที่ vector/
-- backend) seed ไว้ล่วงหน้าเผื่อสเตปถัดไป
INSERT INTO api_keys (tenant, source, key_hash)
SELECT 'demoA', 'api', crypt('demoA-dev-key-000', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM api_keys WHERE tenant = 'demoA' AND source = 'api');

INSERT INTO api_keys (tenant, source, key_hash)
SELECT 'demoB', 'api', crypt('demoB-dev-key-000', gen_salt('bf'))
WHERE NOT EXISTS (SELECT 1 FROM api_keys WHERE tenant = 'demoB' AND source = 'api');

-- --- ตัวอย่าง alert rule ตามที่โจทย์ยกตัวอย่างไว้พอดี: ---
-- "ล็อกอินล้มเหลวซ้ำๆ จาก IP เดิมภายใน 5 นาที"
-- condition เป็น JSONB อิสระ รูปแบบนี้ยังไม่มีตัว evaluator อ่านจริง (สเตป
-- Alerting ที่ยังไม่ได้ทำ) เก็บไว้ล่วงหน้าให้เห็นรูปร่างข้อมูลที่ต้องรองรับ
INSERT INTO alert_rules (tenant, name, condition, channel, channel_config)
SELECT
  'demoA',
  'Repeated failed login (5 min)',
  '{"action": "deny", "event_type_contains": "login", "window_minutes": 5, "threshold": 3, "group_by": ["src_ip"]}'::jsonb,
  'ui',
  '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM alert_rules WHERE tenant = 'demoA' AND name = 'Repeated failed login (5 min)'
);
