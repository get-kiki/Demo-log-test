import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.tsx";

export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div className="p-6 text-slate-500">กำลังโหลด...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
