# เหมือน backend/Dockerfile ทุกจุด (ดูคอมเมนต์ที่นั่นสำหรับเหตุผลแต่ละบรรทัด) —
# build context = root ของ repo เพราะ npm workspaces ต้องเห็น package.json ของ
# root และของ packages/shared ตอน install ด้วย (frontend พึ่ง @log-platform/shared)
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=frontend --include-workspace-root

COPY packages/shared packages/shared
COPY frontend frontend

# ยังไม่ build เป็น static (`vite build`) — รัน dev server ตรงๆ เหมือน backend/
# worker เพื่อให้แก้ src/ แล้วเห็นผลทันทีผ่าน volume mount ไม่ต้อง build image
# ใหม่ทุกครั้ง ค่อยเปลี่ยนเป็น production build (`vite build` + serve static)
# ตอนถึงสเต็ป Deployment/hardening จริงจัง
WORKDIR /app/frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]
