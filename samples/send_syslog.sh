#!/usr/bin/env bash
# ส่ง syslog เข้า Vector โดยตรง (port 5514) — รองรับทั้ง UDP และ TCP
#
# ใช้ /dev/udp/ และ /dev/tcp/ ที่ bash มีในตัวอยู่แล้ว (bash เปิดเป็น
# pseudo-device ให้เขียนลง network socket ได้ตรงๆ ผ่าน redirect ธรรมดา) ไม่ต้อง
# พึ่ง `nc`/`logger` ภายนอกเลย — สำคัญเพราะเครื่อง Windows ส่วนใหญ่ไม่มีสองตัวนี้
# ติดตั้งไว้ (ต่างจาก Linux/macOS ที่มักมีมาให้)
#
# ใช้งาน:
#   ./send_syslog.sh                    ยิงตัวอย่างทั้ง 2 แบบจากข้อสอบ (UDP+TCP)
#   ./send_syslog.sh udp '<message>'    ยิงข้อความเองผ่าน UDP
#   ./send_syslog.sh tcp '<message>'    ยิงข้อความเองผ่าน TCP
set -euo pipefail

HOST="${VECTOR_HOST:-localhost}"
PORT="${VECTOR_SYSLOG_PORT:-5514}"

# UDP: เขียนบรรทัดเดียวจบ ไม่ต้องเปิด/ปิด connection (UDP ไม่มี connection อยู่แล้ว)
send_udp() {
  echo "$1" > "/dev/udp/${HOST}/${PORT}"
}

# TCP: ต้องเปิด file descriptor (3) ผูกกับ socket ก่อน เขียนเข้าไป แล้วปิดทิ้ง
send_tcp() {
  exec 3<>"/dev/tcp/${HOST}/${PORT}"
  echo "$1" >&3
  exec 3>&-
}

# ตัวอย่างจาก FullStack Inturn.pdf หัวข้อ 4.1-4.2 แต่แทน timestamp ในข้อความ
# ด้วยเวลาปัจจุบัน (ของเดิมในข้อสอบตายตัวที่ "Aug 20" ซึ่งไม่ใช่ "วันนี้" — ถ้า
# ใช้ตรงๆ log จะไม่โผล่ในช่วงเวลา 24 ชม.ล่าสุดที่ dashboard ดู default)
NOW="$(date -u '+%b %e %H:%M:%S')"
FIREWALL_SAMPLE="<134>${NOW} fw01 vendor=demo product=ngfw action=deny src=10.0.1.10 dst=8.8.8.8 spt=5353 dpt=53 proto=udp msg=DNS blocked policy=Block-DNS"
NETWORK_SAMPLE="<190>${NOW} r1 if=ge-0/0/1 event=link-down mac=aa:bb:cc:dd:ee:ff reason=carrier-loss"

if [ $# -eq 0 ]; then
  echo "=== ยิง firewall log ผ่าน UDP ($HOST:$PORT) ==="
  send_udp "$FIREWALL_SAMPLE"
  echo "ส่งแล้ว"

  echo "=== ยิง network log ผ่าน TCP ($HOST:$PORT) ==="
  send_tcp "$NETWORK_SAMPLE"
  echo "ส่งแล้ว"

  echo
  echo "เสร็จแล้ว — เช็คผลได้ที่หน้า Search (filter source=firewall หรือ source=network) ภายใน 1 นาที"
elif [ "$1" = "udp" ] && [ $# -eq 2 ]; then
  send_udp "$2"
  echo "ส่งผ่าน UDP แล้ว"
elif [ "$1" = "tcp" ] && [ $# -eq 2 ]; then
  send_tcp "$2"
  echo "ส่งผ่าน TCP แล้ว"
else
  echo "ใช้งาน: $0 [udp|tcp] '<syslog message>'  (ไม่ใส่อะไรเลย = ยิงตัวอย่างจากข้อสอบให้)" >&2
  exit 1
fi
