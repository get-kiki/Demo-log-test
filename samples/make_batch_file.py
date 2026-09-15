#!/usr/bin/env python3
"""สร้างไฟล์ .ndjson ตัวอย่างสำหรับทดสอบช่องทาง "File batch" ingestion

ต่างจาก post_logs.py (ยิงทีละ event ผ่าน HTTP POST /ingest) — ไฟล์นี้จำลอง
สถานการณ์ที่มักเจอจริงกับ log แบบ batch/export (เช่น CloudTrail export เป็นก้อน,
M365 audit log ที่ดึงมาทีเดียวหลาย record) หนึ่งบรรทัด = หนึ่ง JSON object
รูปร่างเดียวกับที่ post_logs.py ใช้เป๊ะ (decode_spool.toml ทำแค่ parse_json! ทีละ
บรรทัดแล้วส่งเข้า pipeline เดียวกันกับทุกช่องทาง ไม่มีอะไรพิเศษ)

ใช้งาน:
    python make_batch_file.py              เขียนลง ../spool/batch-<เวลาปัจจุบัน>.ndjson
    python make_batch_file.py out.ndjson   กำหนด path เอง

หมายเหตุ: ../spool ต้องถูก mount เข้า container ของ vector ที่ /spool อยู่แล้ว
(ดู docker-compose.yml) ไฟล์ที่เขียนออกมาจะถูก Vector อ่านเองอัตโนมัติภายใน
ไม่กี่วินาที ถ้า `docker compose up` รันอยู่ ไม่ต้อง restart อะไรเพิ่ม
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# คัดมาจากตัวอย่างเดียวกับ post_logs.py (aws/m365/ad) — เลือก 3 แหล่งที่มัก
# มาเป็นก้อนไฟล์ export จริงในโลกจริง ต่างจาก firewall/network (syslog สด)
# และ api (event เดี่ยวๆ ต่อครั้ง) ที่เหมาะกับ real-time มากกว่า
SAMPLES = [
    {
        "tenant": "demoB",
        "source": "aws",
        "cloud": {"service": "iam", "account_id": "123456789012", "region": "ap-southeast-1"},
        "event_type": "CreateUser",
        "user": "admin",
        "@timestamp": now_iso(),
        "raw": {"eventName": "CreateUser", "requestParameters": {"userName": "temp-user"}},
    },
    {
        "tenant": "demoB",
        "source": "m365",
        "event_type": "UserLoggedIn",
        "user": "bob@demo.local",
        "ip": "198.51.100.23",
        "status": "Success",
        "workload": "Exchange",
        "@timestamp": now_iso(),
    },
    {
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
]


def default_out_path() -> Path:
    spool_dir = Path(__file__).resolve().parent.parent / "spool"
    spool_dir.mkdir(parents=True, exist_ok=True)
    return spool_dir / f"batch-{int(time.time())}.ndjson"


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_out_path()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with out_path.open("w", encoding="utf-8") as f:
        for sample in SAMPLES:
            f.write(json.dumps(sample) + "\n")

    print(f"เขียน {len(SAMPLES)} events ลง {out_path}")
    print("เช็คผลได้ที่หน้า Search ภายในไม่กี่วินาที (filter source=aws/m365/ad)")


if __name__ == "__main__":
    main()
