# เหมือน backend/Dockerfile ทุกจุด (ดูคอมเมนต์ที่นั่นสำหรับเหตุผลแต่ละบรรทัด) —
# build context = root, install ผ่าน npm workspace, รันด้วย nodemon (dev mode)
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY worker/package.json worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspace=@log-platform/worker --include-workspace-root

COPY packages/shared packages/shared
COPY worker worker

WORKDIR /app/worker
CMD ["npm", "run", "dev"]
