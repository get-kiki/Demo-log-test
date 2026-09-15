.PHONY: help env check-secrets up down logs seed saas-up trust-cert

ENV_FILE := .env
ENV_EXAMPLE := .env.example

help:
	@echo "เป้าหมายที่ใช้ได้:"
	@echo "  make up         -> โหมด Appliance: สร้าง .env (ถ้ายังไม่มี) + docker compose up + seed ข้อมูลตัวอย่าง"
	@echo "  make saas-up    -> โหมด SaaS: เหมือน up แต่ผ่าน docker-compose.saas.yml (ต้องตั้ง SAAS_DOMAIN/SAAS_ACME_EMAIL ใน .env เองก่อน)"
	@echo "  make seed       -> รัน db/seed/seed.sql ซ้ำได้เรื่อยๆ (idempotent)"
	@echo "  make trust-cert -> ดึง internal CA cert ของ Caddy ออกมาเป็น caddy-root-ca.crt (โหมด appliance เท่านั้น)"
	@echo "  make down       -> หยุดทุก service"
	@echo "  make logs       -> ดู log ทุก service แบบ follow"

# ------------------------------------------------------------------
# env: สร้าง .env จาก .env.example ครั้งแรก + generate secret ให้เอง
# ------------------------------------------------------------------
# ตั้งใจไม่ทับ .env ที่มีอยู่แล้ว (เผื่อมีคนแก้ค่าจริงไว้แล้ว) — ถ้าอยากสร้าง
# ใหม่ทั้งหมดต้องลบ .env ทิ้งเองก่อนแล้วค่อยรัน make env/up ใหม่
#
# ใช้ `openssl rand -hex` ไม่ใช่ `node -e "require('crypto')..."` แบบที่
# คอมเมนต์ใน .env.example แนะนำไว้เดิม เพราะเครื่อง host ที่รัน `make` (Ubuntu
# เปล่าๆ ตามสเปก appliance) ไม่จำเป็นต้องมี Node.js ติดตั้งอยู่เลย — Node
# รันอยู่แค่ *ข้างใน* container เท่านั้น แต่ openssl มีติดมากับ Ubuntu แทบทุก
# รุ่นอยู่แล้วโดย default
env:
	@if [ ! -f $(ENV_FILE) ]; then \
		cp $(ENV_EXAMPLE) $(ENV_FILE); \
		PG_PASS=$$(openssl rand -hex 24); \
		JWT_A=$$(openssl rand -hex 32); \
		JWT_R=$$(openssl rand -hex 32); \
		sed -i "s/changeme_dev_password/$$PG_PASS/g" $(ENV_FILE); \
		sed -i "s/replace_with_64_char_hex_random_value/$$JWT_A/" $(ENV_FILE); \
		sed -i "s/replace_with_a_different_64_char_hex_random_value/$$JWT_R/" $(ENV_FILE); \
		echo "สร้าง $(ENV_FILE) แล้ว พร้อม generate POSTGRES_PASSWORD / JWT secret ให้อัตโนมัติ"; \
	else \
		echo "$(ENV_FILE) มีอยู่แล้ว ข้ามการสร้างใหม่ (ลบไฟล์ทิ้งเองถ้าต้องการให้ generate secret ใหม่)"; \
	fi

# กันเคส .env ถูกสร้างเอง (copy มือ ไม่ผ่าน `make env`) แล้วลืมแก้ค่า default
# ทิ้งไว้ — เช็คก่อนทุกครั้งที่จะ up จริง ดีกว่าปล่อยให้รันขึ้นมาด้วย secret
# ที่คาดเดาได้ (เหตุผลเดียวกับ requireEnv() ใน backend/src/env.ts: fail ให้
# ชัดเจนแต่แรก ดีกว่าไปพังทีหลังแบบไม่รู้สาเหตุ)
check-secrets: env
	@if grep -q "changeme_dev_password\|replace_with_64_char_hex_random_value\|replace_with_a_different_64_char_hex_random_value" $(ENV_FILE); then \
		echo "ERROR: $(ENV_FILE) ยังมีค่า default (changeme_dev_password / replace_with_...) อยู่ — แก้ให้เป็นค่าจริงก่อน"; \
		exit 1; \
	fi

# ------------------------------------------------------------------
# up: โหมด Appliance — คำสั่งเดียวจบ
# ------------------------------------------------------------------
# --wait รอจนกว่า healthcheck ของทุก service (มีแค่ postgres ที่ประกาศ
# healthcheck ไว้ใน docker-compose.yml) ผ่านก่อนค่อยคืน prompt กลับมา —
# กัน `make seed` วิ่งชนจังหวะที่ postgres ยังไม่พร้อมรับ connection
up: check-secrets
	docker compose up -d --build --wait
	$(MAKE) seed
	@echo ""
	@echo "พร้อมใช้งานที่ https://localhost/ (หรือ IP ของเครื่องนี้) — browser จะเตือน"
	@echo "self-signed certificate ครั้งแรก ดู 'make trust-cert' ถ้าอยากเอา warning ออก"

# ------------------------------------------------------------------
# saas-up: โหมด SaaS — ต้องมี SAAS_DOMAIN/SAAS_ACME_EMAIL ที่เป็นค่าจริงก่อน
# ------------------------------------------------------------------
saas-up: check-secrets
	@if grep -q "SAAS_DOMAIN=log.example.com\|SAAS_ACME_EMAIL=you@example.com" $(ENV_FILE); then \
		echo "ERROR: ยังไม่ได้แก้ SAAS_DOMAIN / SAAS_ACME_EMAIL ใน $(ENV_FILE) ให้เป็นค่าจริง"; \
		echo "       (ต้องมี DNS ชี้มาที่เครื่องนี้แล้วจริงๆ ก่อนรันด้วย — ดู docs/setup_saas.md)"; \
		exit 1; \
	fi
	docker compose -f docker-compose.yml -f docker-compose.saas.yml up -d --build --wait
	$(MAKE) seed

# ------------------------------------------------------------------
# seed: แยกจาก up เพื่อให้เรียกซ้ำเองได้ (เช่น ล้าง DB แล้วอยาก seed ใหม่)
# ------------------------------------------------------------------
# -T ปิด pseudo-tty ตอน exec — ต้องปิดเพราะเรา pipe เนื้อไฟล์ผ่าน stdin
# (< db/seed/seed.sql) ไม่ใช่พิมพ์โต้ตอบสด ถ้าเปิด tty ไว้ psql จะไม่รับ
# input จาก pipe แบบนี้ปกติ
#
# ใช้ sh -c 'psql -U "$$POSTGRES_USER" ...' เพื่อให้ $POSTGRES_USER/
# $POSTGRES_DB ถูก expand จาก environment ข้างใน container postgres เอง
# (ที่มีอยู่แล้วจาก env_file: .env) ไม่ต้องให้ Makefile อ่าน .env เองซ้ำอีกที
seed:
	docker compose exec -T postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' < db/seed/seed.sql

# ------------------------------------------------------------------
# trust-cert: ดึง root CA cert ของ Caddy ออกมา (โหมด appliance เท่านั้น —
# โหมด saas ใช้ Let's Encrypt ที่ browser เชื่ออยู่แล้ว ไม่ต้องมีขั้นนี้)
# ------------------------------------------------------------------
trust-cert:
	docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root-ca.crt
	@echo "ได้ caddy-root-ca.crt แล้ว — import เข้า trust store ของ OS/browser เอง"
	@echo "(ขั้นตอน import ต่างกันตาม OS ดู docs/setup_appliance.md)"

down:
	docker compose down

logs:
	docker compose logs -f
