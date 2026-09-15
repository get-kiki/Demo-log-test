import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext.tsx";

// วางไว้ "ต่อจาก" RequireAuth เสมอ (ดู App.tsx) เหมือนที่ backend ทำ
// preHandler: [requireAuth, requireRole("admin")] — ต้องผ่านด่านมีตัวตนก่อน
// ถึงจะมาเช็ค role ได้ ไม่งั้น user?.role จะอ่านจาก null เสมอ
export function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}
