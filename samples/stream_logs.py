#!/usr/bin/env python3
"""ยิง log เข้า Vector ต่อเนื่องเรื่อยๆ จนกว่าจะกด Ctrl+C ครบทั้ง 3 โปรโตคอลที่ข้อสอบขอ

สลับช่องทางแบบสุ่มทุกรอบ:
  - http        POST JSON เข้า /ingest ผ่าน Caddy (เหมือน post_logs.py)
  - syslog_udp  ส่ง syslog line ดิบเข้า Vector port 5514 ผ่าน UDP โดยตรง (ไม่ผ่าน Caddy —
                Caddy คุย syslog ดิบไม่ได้ ดู Caddyfile/docker-compose.yml)
  - syslog_tcp  เหมือนกันแต่ผ่าน TCP
  - file_batch  append บรรทัด JSON เข้าไฟล์ .ndjson ใน spool/ (Vector tail ไฟล์นี้อยู่แล้ว
                จาก sources.toml: read_from="beginning" อ่านบรรทัดใหม่ที่ถูกเติมได้ทันที)

ต่างจาก post_logs.py / send_syslog.sh / make_batch_file.py (ยิงตัวอย่างคงที่แล้วจบ)
สคริปต์นี้สุ่มค่าทุกรอบและวนไม่หยุด เหมาะตอนอัดวิดีโอเดโม/เปิด dashboard ทิ้งไว้ดู
ข้อมูลขยับสดๆ จากทุกโปรโตคอลพร้อมกัน

ทุกๆ --burst-every รอบ จะแทรก "burst" ยิง login fail จาก IP เดิมติดกัน 3 ครั้งผ่าน
http/api (ครบ threshold ของ rule ตัวอย่าง "Repeated failed login" ที่ seed ไว้ให้
demoA อยู่แล้ว) ให้เห็น alert เกิดขึ้นจริงระหว่างเดโม — ใช้ http เสมอเพราะมีแค่
source นี้เท่านั้นที่ event_type มีคำว่า "login" ตรงเงื่อนไข rule (firewall/network
syslog ไม่มี "login" ใน event_type เลย)

ทุกๆ --dead-letter-every รอบ จะยิง event ที่ field บังคับขาด (ไม่มี event_type) เข้า
http/api โดยตั้งใจ — parse_api.toml จะ abort() แล้วไหลไปที่ dead-letter file +
ถูกแปลงเป็นแถว source=parse_error เข้า logs ให้เห็นใน Search/dashboard (ดู
vector/tests.toml เคส 8-9 ที่เทสพฤติกรรมนี้ไว้แล้ว) — response ที่ได้ยังเป็น 200
ปกติเสมอ เพราะ Vector รับ HTTP request ไว้ก่อนแล้วค่อย parse ทีหลัง (async) เช็คผล
จริงต้องดูที่ Search filter source=parse_error ไม่ใช่ดูจาก status code

ใช้งาน:
    python stream_logs.py                          ยิงทุก 2 วิ สลับทั้ง 3 โปรโตคอล จนกว่าจะ Ctrl+C
    python stream_logs.py --interval 0.5            ยิงถี่ขึ้น
    python stream_logs.py --tenant demoB            ยิงเข้า tenant เดียว (default: สุ่มทั้ง demoA/demoB)
    python stream_logs.py --channels http,file_batch  เลือกเฉพาะบางโปรโตคอล
    python stream_logs.py --burst-every 0           ปิด burst login-fail
    python stream_logs.py --dead-letter-every 0     ปิด dead-letter demo
"""
import argparse
import json
import random
import socket
import ssl
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

BASE_URL = "https://localhost/ingest"
SYSLOG_HOST = "localhost"
SYSLOG_PORT = 5514
SPOOL_DIR = Path(__file__).resolve().parent.parent / "spool"

# key ต่อ tenant จาก db/seed/seed.sql (ค่าเดโม/dev เท่านั้น เปลี่ยนก่อนใช้งานจริงเสมอ)
API_KEYS = {
    "demoA": "demoA-dev-key-000",
    "demoB": "demoB-dev-key-000",
}

# ปิดการเช็ค cert เฉพาะสคริปต์ demo นี้ (โหมด appliance ใช้ self-signed) — เหตุผล
# เดียวกับ post_logs.py
INSECURE_CTX = ssl.create_default_context()
INSECURE_CTX.check_hostname = False
INSECURE_CTX.verify_mode = ssl.CERT_NONE

USERS = ["alice", "bob", "charlie", "diana", "eve"]
FAIL_REASONS = ["wrong_password", "account_locked", "mfa_failed", "expired_password"]
WIN_HOSTS = ["WIN10-01", "WIN10-02", "LAPTOP-FIN-07"]
PROCESSES = ["powershell.exe", "mimikatz.exe", "rundll32.exe", "cmd.exe"]
AWS_EVENTS = ["CreateUser", "DeleteUser", "AttachUserPolicy", "ConsoleLogin"]
M365_WORKLOADS = ["Exchange", "SharePoint", "Teams"]
FIREWALL_POLICIES = ["Block-DNS", "Allow-Web", "Block-SSH", "Allow-HTTPS"]
NETWORK_REASONS = ["carrier-loss", "admin-shutdown", "auto-negotiation"]

# ไฟล์ batch ไฟล์เดียวที่โตขึ้นเรื่อยๆ ตลอดการรันครั้งนี้ (append ต่อท้าย) จำลองไฟล์
# export ที่เติบโตแบบ streaming จริง — ตั้งชื่อครั้งเดียวตอน process เริ่ม
STREAM_BATCH_FILE = SPOOL_DIR / f"stream-{int(time.time())}.ndjson"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def syslog_ts() -> str:
    # ต้องตรงฟอร์แมต BSD syslog "%b %e %H:%M:%S" (เช่น "Aug 20 12:44:56") ที่ VRL
    # parse_syslog!() คาดหวัง — ไม่ใช้ strftime("%e") ตรงๆ เพราะ %e เป็น glibc
    # extension ที่ Windows ไม่รองรับ (จะ error) ประกอบเองแทนด้วยวันที่ space-pad
    # ความกว้าง 2 หลัก ผลลัพธ์เหมือน %e เป๊ะไม่ว่าจะรันบน OS ไหน
    now = datetime.now(timezone.utc)
    return now.strftime(f"%b {now.day:2d} %H:%M:%S")


def random_ip() -> str:
    return f"203.0.113.{random.randint(1, 254)}"


def random_mac() -> str:
    return ":".join(f"{random.randint(0, 255):02x}" for _ in range(6))


# ============ ช่องทาง http (JSON ผ่าน /ingest) ============


def sample_api(tenant: str, force_fail_ip: Optional[str] = None) -> dict:
    failed = force_fail_ip is not None or random.random() < 0.4
    return {
        "tenant": tenant,
        "source": "api",
        "event_type": "app_login_failed" if failed else "app_login_success",
        "user": random.choice(USERS),
        "ip": force_fail_ip or random_ip(),
        "reason": random.choice(FAIL_REASONS) if failed else "ok",
        "@timestamp": now_iso(),
    }


def sample_crowdstrike(tenant: str) -> dict:
    return {
        "tenant": tenant,
        "source": "crowdstrike",
        "event_type": random.choice(["malware_detected", "suspicious_process"]),
        "host": random.choice(WIN_HOSTS),
        "process": random.choice(PROCESSES),
        "severity": random.randint(4, 10),
        "sha256": "".join(random.choices("abcdef0123456789", k=12)) + "...",
        "action": random.choice(["quarantine", "kill_process", "allowed"]),
        "@timestamp": now_iso(),
    }


def sample_aws(tenant: str) -> dict:
    event_name = random.choice(AWS_EVENTS)
    return {
        "tenant": tenant,
        "source": "aws",
        "cloud": {"service": "iam", "account_id": "123456789012", "region": "ap-southeast-1"},
        "event_type": event_name,
        "user": random.choice(USERS + ["admin"]),
        "@timestamp": now_iso(),
        "raw": {"eventName": event_name},
    }


def sample_m365(tenant: str) -> dict:
    return {
        "tenant": tenant,
        "source": "m365",
        "event_type": "UserLoggedIn",
        "user": f"{random.choice(USERS)}@demo.local",
        "ip": random_ip(),
        "status": random.choice(["Success", "Success", "Success", "Failed"]),
        "workload": random.choice(M365_WORKLOADS),
        "@timestamp": now_iso(),
    }


def sample_ad(tenant: str) -> dict:
    failed = random.random() < 0.3
    return {
        "tenant": tenant,
        "source": "ad",
        "event_id": 4625 if failed else 4624,
        "event_type": "LogonFailed" if failed else "LogonSuccess",
        "user": f"demo\\{random.choice(USERS)}",
        "host": "DC01",
        "ip": random_ip(),
        "logon_type": 3,
        "@timestamp": now_iso(),
    }


def sample_malformed_api(tenant: str) -> dict:
    # จงใจไม่ใส่ event_type (field บังคับของ lane api ตาม parse_api.toml: "if
    # ts_raw == null || .event_type == null || .tenant == null { abort }") ให้
    # Vector abort() แล้วไหลไปเข้า dead-letter + parse_error_normalize แทนที่จะ
    # เป็นแถว source=api ปกติ
    return {
        "tenant": tenant,
        "source": "api",
        "user": random.choice(USERS),
        "ip": random_ip(),
        "reason": "malformed_demo_event (ไม่มี event_type โดยตั้งใจ)",
        "@timestamp": now_iso(),
    }


HTTP_GENERATORS = [sample_api, sample_crowdstrike, sample_aws, sample_m365, sample_ad]

# 3 source นี้มักมาเป็นก้อนไฟล์ export จริงในโลกจริง (เหตุผลเดียวกับที่
# make_batch_file.py เลือกไว้) — ใช้ generator เดิมได้เลย แค่เขียนลงไฟล์แทนยิง HTTP
FILE_BATCH_GENERATORS = [sample_aws, sample_m365, sample_ad]


def post_http(payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "X-Api-Key": API_KEYS[payload["tenant"]]}
    req = urllib.request.Request(BASE_URL, data=body, headers=headers, method="POST")
    label = f"http {payload['tenant']}/{payload['source']}/{payload.get('event_type', '<missing>')}"
    try:
        with urllib.request.urlopen(req, context=INSECURE_CTX, timeout=5) as resp:
            print(f"[{now_iso()}] OK   {label} (status={resp.status})")
    except urllib.error.HTTPError as e:
        print(f"[{now_iso()}] FAIL {label} status={e.code} body={e.read().decode()}")
    except urllib.error.URLError as e:
        print(f"[{now_iso()}] FAIL {label} connect: {e.reason}")


# ============ ช่องทาง syslog (UDP/TCP port 5514 ตรงๆ) ============


def sample_firewall_syslog() -> str:
    action = random.choice(["deny", "allow"])
    return (
        f"<134>{syslog_ts()} fw01 vendor=demo product=ngfw action={action} "
        f"src={random_ip()} dst={random_ip()} spt={random.randint(1024, 65535)} "
        f"dpt={random.choice([53, 80, 443, 22, 3389])} proto={random.choice(['udp', 'tcp'])} "
        f"msg=traffic_{action} policy={random.choice(FIREWALL_POLICIES)}"
    )


def sample_network_syslog() -> str:
    event = random.choice(["link-up", "link-down"])
    return (
        f"<190>{syslog_ts()} r1 if=ge-0/0/{random.randint(0, 23)} event={event} "
        f"mac={random_mac()} reason={random.choice(NETWORK_REASONS)}"
    )


SYSLOG_GENERATORS = [sample_firewall_syslog, sample_network_syslog]


def send_syslog_udp(message: str) -> None:
    label = f"syslog/udp {message[:50]}..."
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto((message + "\n").encode("utf-8"), (SYSLOG_HOST, SYSLOG_PORT))
        print(f"[{now_iso()}] OK   {label}")
    except OSError as e:
        print(f"[{now_iso()}] FAIL {label} — {e}")
    finally:
        sock.close()


def send_syslog_tcp(message: str) -> None:
    label = f"syslog/tcp {message[:50]}..."
    try:
        with socket.create_connection((SYSLOG_HOST, SYSLOG_PORT), timeout=5) as sock:
            sock.sendall((message + "\n").encode("utf-8"))
        print(f"[{now_iso()}] OK   {label}")
    except OSError as e:
        print(f"[{now_iso()}] FAIL {label} — {e}")


# ============ ช่องทาง file_batch (append ต่อท้ายไฟล์ .ndjson ใน spool/) ============


def append_file_batch(payload: dict) -> None:
    label = f"file_batch {payload['tenant']}/{payload['source']}/{payload['event_type']}"
    SPOOL_DIR.mkdir(parents=True, exist_ok=True)
    with STREAM_BATCH_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload) + "\n")
    print(f"[{now_iso()}] OK   {label} -> {STREAM_BATCH_FILE.name}")


ALL_CHANNELS = ["http", "syslog_udp", "syslog_tcp", "file_batch"]


def send_one(channel: str, tenant: str) -> None:
    if channel == "http":
        post_http(random.choice(HTTP_GENERATORS)(tenant))
    elif channel == "syslog_udp":
        send_syslog_udp(random.choice(SYSLOG_GENERATORS)())
    elif channel == "syslog_tcp":
        send_syslog_tcp(random.choice(SYSLOG_GENERATORS)())
    elif channel == "file_batch":
        append_file_batch(random.choice(FILE_BATCH_GENERATORS)(tenant))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interval", type=float, default=2.0, help="วินาทีระหว่างแต่ละ event (default: 2)")
    parser.add_argument("--tenant", choices=["demoA", "demoB"], help="ยิงเข้า tenant เดียว (default: สุ่มทั้ง demoA/demoB)")
    parser.add_argument(
        "--channels",
        default=",".join(ALL_CHANNELS),
        help=f"comma-separated เลือกโปรโตคอล (default: ทั้งหมด — {','.join(ALL_CHANNELS)})",
    )
    parser.add_argument(
        "--burst-every",
        type=int,
        default=15,
        help="ทุกกี่รอบ ยิง login-fail จาก IP เดิมรัว 3 ครั้งติดผ่าน http/api ให้ alert rule trigger (default: 15, ใส่ 0 เพื่อปิด)",
    )
    parser.add_argument(
        "--dead-letter-every",
        type=int,
        default=10,
        help="ทุกกี่รอบ ยิง event ที่ขาด event_type ผ่าน http/api ให้เห็น dead-letter/parse_error ทำงาน (default: 10, ใส่ 0 เพื่อปิด)",
    )
    args = parser.parse_args()

    channels = [c.strip() for c in args.channels.split(",") if c.strip()]
    for c in channels:
        if c not in ALL_CHANNELS:
            parser.error(f"ไม่รู้จักโปรโตคอล '{c}' (เลือกจาก {ALL_CHANNELS})")

    print(f"ยิง log สลับ {channels} ทุก {args.interval} วิ — กด Ctrl+C เพื่อหยุด")
    count = 0
    try:
        while True:
            tenant = args.tenant or random.choice(["demoA", "demoB"])

            # burst ใช้ tenant demoA + http/api ตายตัวเสมอ (ดูเหตุผลใน docstring บนสุด)
            if args.burst_every and count > 0 and count % args.burst_every == 0:
                burst_ip = random_ip()
                print(f"--- burst: login fail จาก {burst_ip} รัว 3 ครั้ง (จำลองให้ alert rule trigger) ---")
                for _ in range(3):
                    post_http(sample_api("demoA", force_fail_ip=burst_ip))
                    time.sleep(0.3)
            elif args.dead_letter_every and count > 0 and count % args.dead_letter_every == 0:
                print("--- dead-letter demo: ยิง event ขาด event_type (จำลองให้เห็น parse_error) ---")
                post_http(sample_malformed_api(tenant))
            else:
                send_one(random.choice(channels), tenant)

            count += 1
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print(f"\nหยุดแล้ว — ยิงไปทั้งหมด {count} event")


if __name__ == "__main__":
    main()
