import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, setToken, clearToken, getToken } from "../lib/api";
import { disconnectSocket } from "../lib/socket";

export type Role = "ADMIN" | "BRAND" | "INFLUENCER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthResponse {
  token: string;
  user: User;
}

// /api/auth/me returns a raw MongoDB document, which uses _id instead of id
interface MeResponse {
  user: { _id: string; name: string; email: string; role: Role };
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  register: (data: RegisterData) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function handleInactiveAccount() {
      disconnectSocket();
      clearToken();
      setUser(null);
    }
    window.addEventListener("auth:inactive", handleInactiveAccount);
    return () => window.removeEventListener("auth:inactive", handleInactiveAccount);
  }, []);

  // On first load: if a token exists, ask the server who we are
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<MeResponse>("/auth/me")
      .then(({ user: u }) =>
        setUser({ id: u._id, name: u.name, email: u.email, role: u.role }),
      )
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  async function register(data: RegisterData) {
    const res = await api<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  async function login(email: string, password: string) {
    const res = await api<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }

  function logout() {
    disconnectSocket();
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
