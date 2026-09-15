import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { RequireAuth } from "./auth/RequireAuth.tsx";
import { RequireAdmin } from "./auth/RequireAdmin.tsx";
import { Layout } from "./components/Layout.tsx";
import { Overview } from "./pages/Overview.tsx";
import { Search } from "./pages/Search.tsx";
import { Alerts } from "./pages/Alerts.tsx";
import { Rules } from "./pages/Rules.tsx";
import { Login } from "./pages/Login.tsx";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Overview />} />
                <Route path="/search" element={<Search />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route element={<RequireAdmin />}>
                  <Route path="/rules" element={<Rules />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
