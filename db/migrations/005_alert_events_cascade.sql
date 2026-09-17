-- ============================================================
-- Migration 005: ON DELETE CASCADE สำหรับ alert_events.rule_id
-- ============================================================
-- ปัญหาที่เจอจริงตอนทดสอบผ่านหน้า Rules: DELETE /api/v1/rules/:id ล้มเหลวเงียบๆ
-- ทุกครั้งที่ rule นั้นเคย trigger alert มาแล้วอย่างน้อย 1 ครั้ง — เพราะ 001_init.sql
-- ประกาศ alert_events.rule_id REFERENCES alert_rules(id) แบบไม่ระบุ ON DELETE เลย
-- (default ของ Postgres คือ NO ACTION — ห้ามลบ parent ถ้ายังมี child อ้างอิงอยู่)
-- error ที่เกิดขึ้นจริง:
--   "update or delete on table alert_rules violates foreign key constraint
--    alert_events_rule_id_fkey ... still referenced from table alert_events"
--
-- error นี้ไม่เคยไปถึงผู้ใช้เลย เพราะ backend (alerts/rules-repository.ts) ไม่ได้ดัก
-- exception นี้ไว้ และ frontend (useDeleteRule ใน api/rules.ts) ก็ไม่มี onError แสดง
-- อะไรเลย — กดปุ่ม "ลบ" แล้วรู้สึกเหมือนไม่มีอะไรเกิดขึ้น ทั้งที่พังอยู่เบื้องหลัง
--
-- แก้ด้วย ON DELETE CASCADE: ลบ rule แล้วลบประวัติ alert_events ของ rule นั้นไปด้วย
-- เลย (สมเหตุสมผลกว่าการห้ามลบเฉยๆ — ถ้า rule ต้นตอไม่มีอยู่แล้ว ประวัติ alert ที่ผูก
-- กับมันก็ไม่มีความหมายให้เก็บต่อ ไม่ต้องมีขั้นตอนเพิ่มให้ผู้ใช้ไปลบ alert_events เองก่อน)
ALTER TABLE alert_events DROP CONSTRAINT alert_events_rule_id_fkey;
ALTER TABLE alert_events ADD CONSTRAINT alert_events_rule_id_fkey
  FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE;
