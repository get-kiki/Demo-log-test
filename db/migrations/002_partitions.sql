-- ============================================================
-- Migration 002: partition safety net + retention automation
-- ============================================================
-- ปัญหาที่เจอจริงตอนทดสอบ ingestion: 001_init.sql สร้าง partition แบบ
-- hardcode ไว้แค่ 2 วัน (04-05 ก.ย. 2026 — วันที่รันตอนเขียน migration)
-- insert แถวที่ ts อยู่นอกช่วงนี้ (เช่น sample ในข้อสอบที่ใช้วันที่ 20 ส.ค. 2025)
-- ถูก postgres ปฏิเสธทันทีด้วย error "no partition of relation logs found
-- for row" เพราะ partition แบบ RANGE ไม่มี catch-all ในตัว

-- 1) DEFAULT partition — ตาข่ายนิรภัย รับทุกแถวที่ไม่มี partition เฉพาะวัน
--    รองรับ (ข้อมูลเก่าจาก sample, ข้อมูล backfill, หรือวันที่ยังไม่ได้สร้าง
--    partition ล่วงหน้าไว้) การันตีว่า insert จะไม่มีวันล้มเหลวเพราะเรื่อง
--    partition อีก ไม่ว่า ts จะเป็นวันไหนก็ตาม
CREATE TABLE logs_default PARTITION OF logs DEFAULT;

-- 2) ฟังก์ชัน maintenance เดียว เรียกซ้ำได้ (idempotent) ทำ 2 หน้าที่:
--      a) สร้าง partition ล่วงหน้าสำหรับวันนี้ + N วันข้างหน้า (กัน insert ของ
--         วันถัดๆ ไปพลาดไปตกที่ logs_default ซึ่ง query ช้ากว่าเพราะไม่ได้
--         ถูกตัด scope ด้วย ts เท่า partition รายวัน)
--      b) ลบ partition รายวันที่เก่ากว่า retention_days ทำ retention ตาม
--         ข้อสอบ (ขั้นต่ำ 7 วัน) — ตั้ง default ไว้ 14 วันให้มี buffer เกินขั้นต่ำ
--         หมายเหตุ: ไม่แตะ logs_default เพราะไม่รู้ว่าข้างในมีข้อมูลช่วงไหนบ้าง
CREATE OR REPLACE FUNCTION maintain_logs_partitions(
  days_ahead     INT DEFAULT 3,
  retention_days INT DEFAULT 14
) RETURNS void AS $$
DECLARE
  d          DATE;
  part_name  TEXT;
  cutoff     DATE := CURRENT_DATE - retention_days;
  r          RECORD;
BEGIN
  FOR i IN 0..days_ahead LOOP
    d := CURRENT_DATE + i;
    part_name := 'logs_' || to_char(d, 'YYYY_MM_DD');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF logs FOR VALUES FROM (%L) TO (%L)',
        part_name, d, d + 1
      );
    END IF;
  END LOOP;

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

-- เรียกทันทีตอน migrate เพื่อให้มี partition ของ "วันนี้ + 3 วันข้างหน้า" พร้อม
-- ใช้ทันที — การรันประจำวัน (ต่อจากนี้) ต้องตั้ง schedule แยกต่างหาก (pg_cron
-- หรือ cron job ภายนอกที่เรียก `SELECT maintain_logs_partitions();`) ยังไม่ได้
-- ทำส่วนนั้น ถือเป็น TODO ที่ต้องต่อกับ worker service ทีหลัง
SELECT maintain_logs_partitions();
