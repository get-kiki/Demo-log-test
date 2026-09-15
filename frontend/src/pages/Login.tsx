import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import { ApiError } from "../api/client.ts";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : "เชื่อมต่อ backend ไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-80 space-y-5 rounded-xl border border-slate-200 bg-white p-7 shadow-card-lg"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Demo log Management</h1>
          <p className="text-xs text-slate-400">รับผมเข้าฝึกงานหน่อยครับ</p>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-500" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-500" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 py-2 font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
