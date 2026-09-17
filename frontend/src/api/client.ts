export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "viewer";
  tenants: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown
  ) {
    super(`API error ${status}`);
  }
}

// แปลง error จาก mutation (react-query) ให้เป็นข้อความอ่านง่ายพอโชว์ผู้ใช้ได้ตรงๆ —
// ใช้ร่วมกันได้ทุกหน้า ไม่ต้องเขียนซ้ำ ดึง message จาก backend ErrorResponse
// ({error, message}) ถ้ามี ไม่งั้น fallback เป็นข้อความทั่วไปตาม status/ประเภท error
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string } | undefined;
    return body?.message ?? `เกิดข้อผิดพลาด (HTTP ${err.status})`;
  }
  return "เชื่อมต่อ backend ไม่สำเร็จ";
}

// เก็บ access token ไว้ในตัวแปรของ module นี้เฉยๆ (ไม่ใช่ localStorage) — หายไป
// ทุกครั้งที่ reload หน้า ตั้งใจ: กัน XSS อ่าน token จาก localStorage ได้ตรงๆ
// ตอนเปิดแอปใหม่ทุกครั้งต้องพึ่ง refreshSession() (ที่ใช้ httpOnly cookie) แทน
let accessToken: string | null = null;

// AuthProvider ผูก callback นี้ไว้ตอน mount — เรียกเมื่อไหร่ก็ตามที่ refresh
// ล้มเหลวจริงๆ (session หมดอายุ/ถูก revoke) เพื่อให้ React state รู้ตัวและ
// เด้งไปหน้า login ได้ — client.ts ไม่ import React เข้ามาโดยตรง
let onExpired: (() => void) | null = null;
export function setOnExpired(cb: () => void) {
  onExpired = cb;
}

// ถ้ามี refresh กำลังทำอยู่แล้ว ให้ผู้เรียกรายถัดไป "รอ promise เดิม" แทนที่จะ
// ยิง POST /refresh ซ้ำอีกรอบ — สำคัญมาก เพราะ refresh token หมุน (rotate) ทุก
// ครั้งที่ใช้ ถ้ามี 2 คำขอพร้อมกันใช้ cookie ตัวเดิม (เช่น React StrictMode ที่
// เรียก effect ซ้ำ 2 รอบตอน mount โดยตั้งใจ หรือ 2 API call พร้อมกันเจอ 401
// พร้อมกันจริงๆ) คำขอที่สองจะไปเจอ session ที่คำขอแรก rotate ทิ้งไปแล้ว โดน
// reuse detection เตะทุก session ทิ้งทั้งที่เพิ่ง login ไปเอง (เจอบั๊กนี้จริง)
let refreshPromise: Promise<AuthUser | null> | null = null;

async function doRefresh(): Promise<AuthUser | null> {
  const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
  if (!res.ok) {
    accessToken = null;
    onExpired?.();
    return null;
  }
  const body = await res.json();
  accessToken = body.access_token;
  return body.user;
}

// เรียก /auth/refresh ตรงๆ ผ่าน fetch เปล่าๆ ไม่ผ่าน apiFetch — ถ้าให้ apiFetch
// เรียก refresh ผ่านตัวเอง แล้ว refresh ดัน 401 กลับมาด้วย จะเป็น infinite loop
export function refreshSession(): Promise<AuthUser | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null; // เคลียร์ทิ้งหลังจบ ไม่ว่าจะสำเร็จหรือพัง — รอบถัดไปยิงใหม่ได้
    });
  }
  return refreshPromise;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})));
  }
  const body = await res.json();
  accessToken = body.access_token;
  return body.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  accessToken = null;
}

// ใช้เรียก endpoint อื่นทั้งหมด (search/stats/rules/alerts) — แปะ Authorization
// header ให้เอง ถ้าโดน 401 (access token หมดอายุกลางทาง — อายุแค่ 15 นาที เกิด
// ขึ้นได้บ่อยระหว่างใช้งานจริง) ลอง refresh ให้เองรอบเดียวแล้ว retry คำขอเดิม
// เงียบๆ — หน้าที่เรียกใช้ไม่ต้องรู้เรื่อง token หมดอายุเลย
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const doFetch = () => {
    const headers = new Headers(options.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(`/api/v1${path}`, { ...options, headers, credentials: "include" });
  };

  let res = await doFetch();
  if (res.status === 401) {
    const user = await refreshSession();
    if (user) res = await doFetch();
  }
  return res;
}

export async function apiJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})));
  }
  return res.json() as Promise<T>;
}
