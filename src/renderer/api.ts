const TOKEN_KEY = "gnpdv_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export type UserRole =
  | "ADMIN"
  | "GERENTE"
  | "VENDEDOR"
  | "ESTOQUE"
  | "COZINHA"
  | "CONFERENTE";

export type User = {
  id: string;
  name: string;
  login: string;
  role: UserRole;
};

export async function apiLogin(login: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  const data = (await res.json()) as { error?: string; token?: string; user?: User };
  if (!res.ok) {
    throw new Error(data.error ?? "Falha no login");
  }
  if (!data.token || !data.user) {
    throw new Error("Resposta inválida do servidor");
  }
  return { token: data.token, user: data.user };
}

export async function apiMe(token: string): Promise<User> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as { error?: string; user?: User };
  if (!res.ok) {
    throw new Error(data.error ?? "Sessão inválida");
  }
  if (!data.user) {
    throw new Error("Resposta inválida do servidor");
  }
  return data.user;
}
