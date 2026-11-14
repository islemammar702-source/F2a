"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, refreshSession, setAccessToken, setSessionHandlers, type TokenResponse } from "./api";
import type { Me } from "./types";

type AuthCtx = {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<Me>;
  logout: () => Promise<void>;
  setUser: (u: Me) => void;
  can: (...perms: string[]) => boolean;
  isClient: boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSessionHandlers(
      () => {
        setAccessToken(null);
        setUser(null);
      },
      (d: TokenResponse) => setUser(d.user),
    );
    // Restore the session from the httpOnly refresh cookie
    refreshSession()
      .then((d) => setUser(d ? d.user : null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Proactively renew the access token before it expires (every 12 minutes)
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      refreshSession().then((d) => {
        if (d) setUser(d.user);
      });
    }, 12 * 60 * 1000);
    return () => clearInterval(id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const d = await api<TokenResponse>("/auth/login", { method: "POST", body: { email, password, remember } });
    setAccessToken(d.access_token);
    setUser(d.user);
    return d.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      login,
      logout,
      setUser,
      can: (...perms) => !!user && perms.every((p) => user.permissions.includes(p)),
      isClient: !!user?.role.is_client_role,
    }),
    [user, loading, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
