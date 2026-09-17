-- ============================================================
-- Migration 004: sub-partition logs ต่อ tenant (nested partitioning)
-- ============================================================
-- เดิม logs partition แค่ชั้นเดียวตาม ts (รายวัน) ทุก tenant ปนกันอยู่ใน
-- partition เดียวกันของแต่ละวัน — เพียงพอสำหรับ query performance (index
-- ทุกตัวขึ้นต้นด้วย tenant อยู่แล้ว btree กรองได้เร็ว) แต่ยังไม่ใช่ physical
-- isolation จริง: ทุก tenant ใช้ heap file เดียวกัน, vacuum/bloat ของ tenant
-- หนึ่งกระทบ query ของอีก tenant ได้, และ "ลบข้อมูลทั้ง tenant" (เช่นยกเลิก
-- สัญญา) ทำได้แค่ DELETE ทีละแถว ไม่มีทาง DROP TABLE รวดเดียว
--
-- migration นี้เพิ่มชั้น sub-partition ตาม tenant เข้าไปใต้ partition รายวัน
-- เดิม: "logs ของ tenant A วันที่ 9 ก.ย." กับ "logs ของ tenant B วันเดียวกัน"
-- กลายเป็นคนละ table จริงในระดับ storage (logs_2026_09_09_demoa vs
-- logs_2026_09_09_demob)
--
-- หมายเหตุสำคัญ: migration นี้ปลอดภัยเฉพาะตอนรันบน volume ใหม่ (bootstrap
-- ต่อจาก 001-003 ในการรันครั้งเดียวกัน) เท่านั้น เพราะ DROP partition รายวัน
-- เดิมทิ้งทั้งหมดก่อนสร้างใหม่แบบ sub-partitioned — ถ้ามีข้อมูลจริงอยู่แล้ว
-- ใน volume ที่รันมาก่อนหน้านี้ ต้อง pg_dump ข้อมูลออกมาก่อน แล้ว insert
-- กลับเข้า schema ใหม่เอง (ไม่ใช่ auto ในสคริปต์นี้ — ตั้งใจไม่ทำ เพราะ
-- migrations/ ทั้งโฟลเดอร์นี้ถูกออกแบบให้รันได้แค่ทางเดียวจาก
-- docker-entrypoint-initdb.d บน volume ว่าง ไม่ใช่ migration runner ที่รองรับ
-- data migration ระหว่างเวอร์ชัน)

-- 1) ลบ partition รายวันเดิมทั้งหมดทิ้งก่อน (ยกเว้น logs_default ที่ยังคง
--    เป็น fallback แบบเดิม ไม่ต้อง sub-partition ต่อ — เป็นแค่ตาข่ายรองรับ
--    ts นอกช่วงที่สร้างไว้ล่วงหน้า ไม่คุ้มเพิ่มความซับซ้อน)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'logs'::regclass
      AND c.relname <> 'logs_default'
  LOOP
    EXECUTE format('DROP TABLE %I', r.relname);
  END LOOP;
END $$;

-- 2) ขยาย primary key ให้มี tenant ด้วย — ข้อบังคับของ Postgres: unique
--    constraint ของ partitioned table ต้องมี partition key ของทุกชั้นรวมอยู่
--    (ts จากชั้นบนสุดที่มีอยู่แล้ว, tenant จากชั้นที่กำลังจะเพิ่ม)
ALTER TABLE logs DROP CONSTRAINT logs_pkey;
ALTER TABLE logs ADD PRIMARY KEY (tenant, ts, event_id);

-- 3) แทนที่ maintain_logs_partitions() ด้วยเวอร์ชันที่สร้าง 2 ชั้น: วัน ->
--    tenant เดิมสร้างแค่ชั้นวันเฉยๆ
CREATE OR REPLACE FUNCTION maintain_logs_partitions(
  days_ahead     INT DEFAULT 3,
  retention_days INT DEFAULT 14
) RETURNS void AS $$
DECLARE
  d           DATE;
  day_part    TEXT;
  tenant_part TEXT;
  tenant_slug TEXT;
  cutoff      DATE := CURRENT_DATE - retention_days;
  r           RECORD;
  t           RECORD;
BEGIN
  FOR i IN 0..days_ahead LOOP
    d := CURRENT_DATE + i;
    day_part := 'logs_' || to_char(d, 'YYYY_MM_DD');

    -- ชั้นที่ 1: partition รายวัน — ต้องประกาศ PARTITION BY LIST (tenant)
    -- ตั้งแต่ตอนสร้างเลย (แปลง plain partition ให้กลายเป็น partitioned table
    -- ทีหลังไม่ได้ ถ้าตารางนี้เคยถูกสร้างแบบเดิมมาก่อนจะไม่เข้าเงื่อนไข
    -- NOT EXISTS นี้แล้ว เพราะฉะนั้นฟังก์ชันนี้ "สร้างวันใหม่ให้ถูกแบบ" ได้
    -- อย่างเดียว ไม่ได้แปลงของเก่าให้ ถ้าของเก่ายังเป็นแบบไม่มี sub-partition
    -- อยู่ ต้องผ่านขั้นตอนแบบข้อ 1 ด้านบนเอง)
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = day_part) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF logs FOR VALUES FROM (%L) TO (%L) PARTITION BY LIST (tenant)',
        day_part, d, d + 1
      );
    END IF;

    -- ชั้นที่ 2: sub-partition ต่อ tenant ที่มีอยู่จริงในตาราง tenants ตอนนี้
    -- ใช้ regexp_replace กัน tenant id ที่มีอักขระแปลกๆ (ช่องว่าง, ขีด, ฯลฯ)
    -- ทำให้ชื่อ partition ไม่ใช่ identifier ที่ใช้ได้ตรงๆ
    FOR t IN SELECT id FROM tenants LOOP
      tenant_slug := lower(regexp_replace(t.id, '[^a-zA-Z0-9]', '_', 'g'));
      tenant_part := day_part || '_' || tenant_slug;
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = tenant_part) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF %I FOR VALUES IN (%L)',
          tenant_part, day_part, t.id
        );
      END IF;
    END LOOP;

    -- default sub-partition ต่อวัน: รับ tenant ที่ยังไม่รู้จัก (เพิ่งสมัคร
    -- หลังจากวันนี้ถูกสร้าง partition ไปแล้ว, หรือ tenant ปลอมจากข้อมูลเพี้ยน)
    -- เหตุผลเดียวกับ logs_default ชั้นบนสุดใน 002 — กัน insert พังเพราะหา
    -- partition ไม่เจอ ไม่ว่า tenant จะเป็นอะไรก็ตาม
    tenant_part := day_part || '_default';
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = tenant_part) THEN
      EXECUTE format('CREATE TABLE %I PARTITION OF %I DEFAULT', tenant_part, day_part);
    END IF;
  END LOOP;

  -- retention: DROP partition รายวันทั้งก้อน — cascade ลบ sub-partition ของ
  -- ทุก tenant ในวันนั้นไปด้วยอัตโนมัติในคำสั่งเดียว (นี่คือประโยชน์ตรงที่
  -- สุดของการ sub-partition: ไม่ต้องวน DROP ทีละ tenant) query หา "ลูกโดยตรง
  -- ของ logs" เหมือนเดิมจาก 002 ไม่ต้องแก้เลย เพราะลงไปถึงแค่ระดับวัน ไม่ลง
  -- ไปถึง tenant sub-partition (ชื่อ tenant sub-partition มี suffix ต่อท้าย
  -- ไม่ตรง pattern ^logs_\d{4}_\d{2}_\d{2}$ อยู่แล้ว)
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'logs'::regclass
      AND c.relname ~ '^logs_\d{4}_\d{2}_\d{2}$'
      AND to_date(substring(c.relname from 'logs_(\d{4}_\d{2}_\d{2})'), 'YYYY_MM_DD') < cutoff
  LOOP
    EXECUTE format('DROP TABLE %I', r.relname);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- เรียกทันทีเหมือน 002 เพื่อให้มี partition ของวันนี้ + N วันข้างหน้าพร้อมใช้
-- — ตอนนี้ตาราง tenants ยังว่างเปล่า (seed.sql ตั้งใจแยกไม่ auto-run ตอน
-- bootstrap) ผลคือรอบแรกนี้แต่ละวันจะมีแค่ logs_YYYY_MM_DD_default ยังไม่มี
-- sub-partition เฉพาะ tenant จนกว่าจะรัน seed.sql — ไม่ต้องเรียกซ้ำเองด้วยมือแล้ว
-- เพราะ worker (worker/src/partitions.ts) เรียกฟังก์ชันนี้ซ้ำทุก 60 วินาทีอยู่แล้ว
-- ภายในไม่เกิน 1 นาทีหลัง seed เสร็จ sub-partition เฉพาะ tenant จะถูกสร้างให้เอง
SELECT maintain_logs_partitions();
