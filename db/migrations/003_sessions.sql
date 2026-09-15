-- ============================================================
-- sessions: ตัวเดียวที่ทำให้ refresh token "เพิกถอนได้จริง"
-- ============================================================
-- ไม่เก็บ refresh token ดิบ เก็บแค่ sha256 hash ของมัน (refresh_token_hash) —
-- เหมือนที่ users.password_hash ไม่เก็บ password ดิบ เหตุผลเดียวกัน: ถ้า DB
-- รั่ว คนอ่านไม่ได้ token ที่ยังเอาไปใช้ยิง /refresh ต่อได้เลย
--
-- revoked_at เป็น null แปลว่า session นี้ยัง valid อยู่ มีค่าแปลว่าตายแล้ว —
-- ไม่สนใจว่าตายเพราะ user กด logout เอง หรือเพราะระบบตรวจพบ token reuse
-- (ดู backend/src/routes/auth.ts หัวข้อ /refresh สำหรับกลไก reuse detection)

CREATE TABLE sessions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         NOT NULL REFERENCES users(id),
  refresh_token_hash  TEXT         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ  NOT NULL,
  revoked_at          TIMESTAMPTZ
);

-- /refresh lookup: "หา session จาก hash ของ token ที่ส่งมา" — ต้องเร็ว วิ่งทุก request
CREATE INDEX ON sessions (refresh_token_hash);

-- "เตะทุก session ของ user นี้ทิ้ง" (logout ทุกอุปกรณ์ + reuse detection) วิ่งเป็น
-- WHERE user_id = ... AND revoked_at IS NULL
CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;
