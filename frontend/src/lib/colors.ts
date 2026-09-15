// Palette จาก dataviz skill (references/palette.md) — คอลัมน์ light เพราะแอปนี้
// เปลี่ยนเป็น light theme แล้ว (validate ผ่าน --mode light --surface #fcfcfb
// จริง มี WARN contrast 3 สี (aqua/yellow/magenta) ต่ำกว่า 3:1 ตามที่เอกสารเตือน
// ไว้ล่วงหน้า — แก้ด้วย legend+tooltip ที่ TimelineChart มีอยู่แล้ว ไม่ต้องพึ่ง
// สีอย่างเดียว) ห้ามสลับลำดับ/สุ่มสีเอง ลำดับนี้ผ่านการ validate adjacent-pair
// CVD มาแล้ว
//
// สีผูกกับ "แหล่งข้อมูล" (entity) ตรงๆ ไม่ใช่ผูกกับอันดับ/ตำแหน่งในกราฟ — ถ้า
// filter ตัดบาง source ออก source ที่เหลือต้องได้สีเดิมเป๊ะ ไม่เลื่อนสีกัน
export const SOURCE_COLORS: Record<string, string> = {
  firewall: "#2a78d6", // slot 1 — blue
  network: "#eb6834", // slot 2 — orange
  api: "#1baf7a", // slot 3 — aqua
  crowdstrike: "#eda100", // slot 4 — yellow
  aws: "#e87ba4", // slot 5 — magenta
  m365: "#008300", // slot 6 — green
  ad: "#4a3aa7", // slot 7 — violet
  // parse_error ไม่ใช่ source ปกติ — เป็นสถานะ "parse ไม่ผ่าน" ใช้สี status
  // critical แทนสี categorical ตัวที่ 8 ตามกฎ: status สงวนไว้สำหรับ state
  parse_error: "#d03b3b",
};

// status palette (fixed — ไม่ผัน light/dark ตามที่ dataviz skill ระบุ) ใช้กับ
// severity badge — คนละชุดกับ SOURCE_COLORS โดยตั้งใจ (สถานะ vs entity)
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export function colorForSource(source: string): string {
  return SOURCE_COLORS[source] ?? "#898781"; // muted gray เผื่อ source ที่ไม่รู้จัก
}

// chart chrome (เฉพาะในการ์ดกราฟ — ส่วนที่เหลือของแอปใช้ Tailwind slate/white
// โทนสว่างเหมือนกัน ดู index.css กับแต่ละ component)
export const CHART = {
  surface: "#fcfcfb",
  primaryInk: "#0b0b0b",
  secondaryInk: "#52514e",
  mutedInk: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
};
