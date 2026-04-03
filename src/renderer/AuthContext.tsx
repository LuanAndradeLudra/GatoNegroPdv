import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiMe, getStoredToken, setStoredToken, type User } from "./api";

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: User; token: string };

type AuthContextValue = {
  state: AuthState;
  login: (token: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const logout = useCallback(() => {
    setStoredToken(null);
    setState({ status: "anonymous" });
  }, []);

  const login = useCallback(async (token: string) => {
    setStoredToken(token);
    const user = await apiMe(token);
    setState({ status: "authenticated", user, token });
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setState({ status: "anonymous" });
      return;
    }
    let cancelled = false;
    apiMe(token)
      .then((user) => {
        if (!cancelled) {
          setState({ status: "authenticated", user, token });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStoredToken(null);
          setState({ status: "anonymous" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
