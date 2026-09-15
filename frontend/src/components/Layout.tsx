import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/search", label: "Search" },
  { to: "/alerts", label: "Alerts" },
  { to: "/rules", label: "Rules", adminOnly: true },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="flex items-center gap-6 border-b border-slate-200 bg-white px-4 py-3 shadow-card">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" stroke="currentColor">
              <path d="M3 12h4l2-7 4 14 2-7h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-900">Demo log Management</span>
        </div>
        <div className="flex flex-1 gap-1">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }: { isActive: boolean }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>
            {user?.email} · <span className="text-slate-400">{user?.role}</span>
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg px-2 py-1 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
