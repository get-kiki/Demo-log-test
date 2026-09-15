import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface TimeRange {
  from: string;
  to: string;
}

const DEFAULT_HOURS = 24;

function computeRange(hours: number): TimeRange {
  const now = new Date();
  return {
    from: new Date(now.getTime() - hours * 3600_000).toISOString(),
    to: now.toISOString(),
  };
}

// เก็บ from/to เป็นค่าสัมบูรณ์ใน URL query string ตรงๆ (ไม่ใช่ "24h ล่าสุด" แบบ
// สัมพัทธ์) — refresh หรือแชร์ลิงก์แล้วเห็นข้อมูลช่วงเวลาเดียวกันเป๊ะเสมอ
export function useTimeRange(): [TimeRange, (hours: number) => void] {
  const [params, setParams] = useSearchParams();
  const from = params.get("from");
  const to = params.get("to");

  useEffect(() => {
    // เข้าหน้านี้ครั้งแรกยังไม่มี from/to ใน URL — คำนวณ default แล้วเขียนกลับ
    // เข้า URL ทันที (replace ไม่ดันเพิ่ม history entry)
    //
    // ใช้ setParams(prev => ...) แบบ functional เสมอ (ไม่ใช่ setParams({...}))
    // เพราะฟอร์มออบเจกต์ตรงๆ จะ "แทนที่ query string ทั้งหมด" ลบ filter อื่น
    // (src_ip, event_type, q ฯลฯ ของหน้า Search) ทิ้งไปด้วยทุกครั้งที่เปลี่ยน
    // ช่วงเวลา — เจอบั๊กนี้ตอนเริ่มออกแบบหน้า Search ที่ต้องใช้ hook นี้ร่วมกับ
    // filter อื่น
    if (!from || !to) {
      const def = computeRange(DEFAULT_HOURS);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("from", def.from);
          next.set("to", def.to);
          return next;
        },
        { replace: true }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const range = useMemo<TimeRange>(() => {
    if (from && to) return { from, to };
    return computeRange(DEFAULT_HOURS); // ใช้ชั่วคราวระหว่างรอ effect ด้านบนเขียน URL
  }, [from, to]);

  function setPreset(hours: number) {
    const def = computeRange(hours);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("from", def.from);
      next.set("to", def.to);
      return next;
    });
  }

  return [range, setPreset];
}
