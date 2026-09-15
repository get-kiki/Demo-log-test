import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  refreshSession,
  login as apiLogin,
  logout as apiLogout,
  setOnExpired,
  type AuthUser,
} from "../api/client.ts";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // ผูก callback ไว้ก่อนเรียก refreshSession ครั้งแรก — เผื่อ session หมดอายุ
    // ไปแล้วจริงๆ (เช่น เปิดแอปครั้งแรกไม่เคย login มาก่อน) ก็ยัง sync กับ
    // React state ได้ถูกทาง (user = null)
    setOnExpired(() => setUser(null));
    refreshSession().then((u) => {
      setUser(u);
      setIsLoading(false);
    });
  }, []);

  async function login(email: string, password: string) {
    const u = await apiLogin(email, password);
    setUser(u);
  }

  async function logout() {
    await apiLogout();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
