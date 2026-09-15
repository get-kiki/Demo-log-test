# build context = root ของ repo (ดู docker-compose.yml: build.context: .)
# ต้องเป็น root เพราะ npm workspaces ต้องเห็น package.json ของ root และของ
# packages/shared ตอน install ด้วย (backend พึ่ง @log-platform/shared)
FROM node:22-alpine

WORKDIR /app

# copy แค่ package.json ก่อน (ยังไม่ copy source code) — Docker cache layer นี้
# จะถูกใช้ซ้ำทุกครั้งที่ build ตราบใดที่ dependency ไม่เปลี่ยน ไม่ต้อง npm install
# ใหม่ทุกครั้งที่แก้โค้ด backend
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=@log-platform/backend --include-workspace-root

COPY packages/shared packages/shared
COPY backend backend

# หมายเหตุ: ตอนนี้ยังไม่ build เป็น dist/ — docker-compose.yml override command
# เป็น `npm run dev` (tsx watch) แทน เพื่อให้แก้โค้ดแล้วเห็นผลทันทีโดยไม่ต้อง
# build image ใหม่ทุกครั้ง (กำลังจะเขียน endpoint อีกหลายตัวต่อจากนี้ ความเร็วรอบ
# แก้โค้ด-ดูผลสำคัญกว่า) ค่อยเปลี่ยนเป็น production build (`npm run build` +
# `CMD node dist/server.js`) ตอนถึงสเต็ป Deployment/hardening
WORKDIR /app/backend
EXPOSE 3000
CMD ["npm", "run", "dev"]
