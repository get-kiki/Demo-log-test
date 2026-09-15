import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// รันได้ 2 ทาง: native บน host (proxy ไป localhost:3000 ที่ docker-compose expose
// พอร์ต api ออกมาให้อยู่แล้ว) หรือในคอนเทนเนอร์ของตัวเอง (ต้องยิงผ่านชื่อ service
// "api" ใน docker network แทน เพราะ "localhost" ข้างในคอนเทนเนอร์คือตัวมันเอง
// ไม่ใช่ host เครื่องจริง) — docker-compose.yml ตั้ง VITE_API_TARGET override
// ให้ตอนรันใน container เท่านั้น รันบน host เหมือนเดิมไม่ต้องตั้งอะไรเพิ่ม
const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // bind 0.0.0.0 แทน default (localhost) — จำเป็นตอนรันในคอนเทนเนอร์ ไม่งั้น
    // port mapping ของ docker-compose เข้าไม่ถึง dev server ข้างในเลย (ไม่กระทบ
    // ตอนรันบน host เพราะ 0.0.0.0 ครอบคลุม localhost อยู่แล้ว)
    host: true,
    // Vite 5+ เช็ค Host header เอง (กัน DNS rebinding) ปกติยอม "localhost" อยู่
    // แล้วในตัว แต่พอมี Caddy อยู่หน้า (docker-compose.yml + Caddyfile) Caddy
    // ส่ง Host header เดิมของ client ต่อให้ frontend ตรงๆ โดยไม่รีไรต์ — ซึ่ง
    // อาจเป็น "localhost", IP วงแลนของเครื่อง appliance, หรือชื่ออื่นที่ผู้ใช้
    // ยิงเข้ามา แล้วแต่ผู้ใช้ตั้ง ไม่รู้ล่วงหน้าว่าจะเป็นชื่อไหน (ปัญหาเดียวกับ
    // `on_demand` ของ Caddy TLS) เลยเปิดรับทุก host ไปก่อน — ยอมรับได้เพราะ
    // service นี้อยู่หลัง Caddy/TLS แล้ว ไม่ได้ expose ตรงออก internet, และจะ
    // เลิกใช้ Vite dev server ตัวนี้ไปเป็น static build ตอนถึงสเต็ป production
    // hardening อยู่แล้ว (ดูคอมเมนต์ใน frontend/Dockerfile)
    allowedHosts: true,
    proxy: {
      // ให้ browser เห็นเป็น same-origin request เสมอ (ไม่ต้องยุ่งกับ CORS เลย)
      // และ topology นี้ตรงกับที่ Caddy จะทำตอน deploy จริง (handle /api/* {
      // reverse_proxy api:3000 }) — dev/prod พฤติกรรม routing เหมือนกัน
      "/api": apiTarget,
    },
  },
});
