#!/usr/bin/env python3
"""ยิง JSON log เข้า Vector ผ่าน HTTP POST /ingest

ใช้ตัวอย่างจาก FullStack Inturn.pdf หัวข้อ 4.3-4.7 (api, crowdstrike, aws,
m365, ad) ตั้งใจใช้แค่ stdlib (urllib) ไม่พึ่ง `requests` — รันได้ทันทีโดยไม่ต้อง
`pip install` อะไรก่อนเลย

ยิงผ่าน Caddy (https://localhost/ingest) ไม่ใช่ Vector ตรงๆ — พอร์ต 8686 ของ
Vector ไม่ได้ publish ออก host เลย (ดู docker-compose.yml) เข้าถึงได้ทาง Caddy
เท่านั้น ซึ่งตอนนี้เช็ค header X-Api-Key ก่อนด้วย forward_auth (ดู Caddyfile +
backend/src/routes/internal.ts) — ไม่แนบ key ที่ถูกต้องจะโดน 401 ตั้งแต่ที่
Caddy เลย ไม่ถึง Vector

ใช้งาน:
    python post_logs.py              ยิงทั้ง 5 แหล่ง
    python post_logs.py api ad       ยิงเฉพาะที่ระบุ
"""
import json
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE_URL = "https://localhost/ingest"

# key ต่อ tenant จาก db/seed/seed.sql (ค่าเดโม/dev เท่านั้น เปลี่ยนก่อนใช้งานจริงเสมอ)
API_KEYS = {
    "demoA": "demoA-dev-key-000",
    "demoB": "demoB-dev-key-000",
}

# โหมด appliance ออก cert self-signed เองจาก internal CA ของ Caddy (ดู
# docs/architecture.md — ข้อสอบอนุญาตไว้ตรงๆ) urllib ไม่รู้จัก CA นี้โดยปริยาย
# ปิดการเช็ค cert เฉพาะสคริปต์ demo นี้ ถ้า trust cert ของเครื่องแล้วด้วย
# `make trust-cert` จะใช้ ssl.create_default_context() เฉยๆ (context=None) ก็ได้
INSECURE_CTX = ssl.create_default_context()
INSECURE_CTX.check_hostname = False
INSECURE_CTX.verify_mode = ssl.CERT_NONE


def now_iso() -> str:
    # ใช้เวลาปัจจุบันแทนวันที่ตายตัวในข้อสอบ (2025-08-20) เพื่อให้ log ที่ยิง
    # ออกไปอยู่ในช่วงเวลาที่ default time range ของ dashboard (24 ชม.ล่าสุด) มองเห็น
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


SAMPLES = {
    "api": {
        "tenant": "demoA",
        "source": "api",
        "event_type": "app_login_failed",
        "user": "alice",
        "ip": "203.0.113.7",
        "reason": "wrong_password",
        "@timestamp": now_iso(),
    },
    "crowdstrike": {
        "tenant": "demoA",
        "source": "crowdstrike",
        "event_type": "malware_detected",
        "host": "WIN10-01",
        "process": "powershell.exe",
        "severity": 8,
        "sha256": "abc...",
        "action": "quarantine",
        "@timestamp": now_iso(),
    },
    "aws": {
        "tenant": "demoB",
        "source": "aws",
        "cloud": {"service": "iam", "account_id": "123456789012", "region": "ap-southeast-1"},
        "event_type": "CreateUser",
        "user": "admin",
        "@timestamp": now_iso(),
        "raw": {"eventName": "CreateUser", "requestParameters": {"userName": "temp-user"}},
    },
    "m365": {
        "tenant": "demoB",
        "source": "m365",
        "event_type": "UserLoggedIn",
        "user": "bob@demo.local",
        "ip": "198.51.100.23",
        "status": "Success",
        "workload": "Exchange",
        "@timestamp": now_iso(),
    },
    "ad": {
        "tenant": "demoA",
        "source": "ad",
        "event_id": 4625,
        "event_type": "LogonFailed",
        "user": "demo\\eve",
        "host": "DC01",
        "ip": "203.0.113.77",
        "logon_type": 3,
        "@timestamp": now_iso(),
    },
}


def post(name: str, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        # key ต้องตรงกับ tenant ของ payload นั้นเอง — verify-key แค่เช็คว่า key
        # ถูกต้องไหม ยังไม่ได้บังคับว่า tenant ใน body ต้องตรงกับเจ้าของ key
        # (ดู TODO ใน backend/src/routes/internal.ts) แต่สคริปต์นี้ตั้งใจส่งให้
        # ตรงกันไว้ก่อนเพื่อจำลองการใช้งานที่ถูกต้อง
        "X-Api-Key": API_KEYS[payload["tenant"]],
    }
    req = urllib.request.Request(BASE_URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, context=INSECURE_CTX) as resp:
            print(f"[{name}] status={resp.status}")
    except urllib.error.HTTPError as e:
        print(f"[{name}] FAILED status={e.code} body={e.read().decode()}")
    except urllib.error.URLError as e:
        print(f"[{name}] FAILED connect to {BASE_URL}: {e.reason}")


def main() -> None:
    targets = sys.argv[1:] or list(SAMPLES.keys())
    for name in targets:
        if name not in SAMPLES:
            print(f"ไม่รู้จัก source: {name} (เลือกจาก {list(SAMPLES.keys())})", file=sys.stderr)
            continue
        post(name, SAMPLES[name])


if __name__ == "__main__":
    main()
