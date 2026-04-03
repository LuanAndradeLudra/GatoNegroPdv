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

export type PermissionModule = "VENDAS" | "ESTOQUE" | "FINANCEIRO" | "COZINHA";

export type PermissionsMap = Record<PermissionModule, string[]>;

export type UserAccess = {
  pdv: boolean;
  erp: boolean;
  manageUsers: boolean;
};

export type User = {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  permissions: PermissionsMap;
  access: UserAccess;
};

export type UserListItem = User & {
  createdAt: string;
  updatedAt: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `Erro HTTP ${res.status}`);
  }
  return data as T;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function apiLogin(login: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  return parseJson(res);
}

export async function apiMe(token: string): Promise<User> {
  const res = await fetch("/api/auth/me", {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ user: User }>(res);
  return data.user;
}

export type PermissionsSchema = {
  modules: PermissionModule[];
  actions: Record<PermissionModule, readonly string[]>;
  defaultsByRole: Record<UserRole, PermissionsMap>;
};

export async function apiPermissionsSchema(token: string): Promise<PermissionsSchema> {
  const res = await fetch("/api/users/permissions-schema", {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export async function apiListUsers(token: string): Promise<UserListItem[]> {
  const res = await fetch("/api/users", { headers: authHeaders(token) });
  const data = await parseJson<{ users: UserListItem[] }>(res);
  return data.users;
}

export async function apiCreateUser(
  token: string,
  body: {
    name: string;
    login: string;
    password: string;
    role: UserRole;
    permissions?: PermissionsMap | null;
  },
): Promise<UserListItem> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ user: UserListItem }>(res);
  return data.user;
}

export async function apiUpdateUser(
  token: string,
  id: string,
  body: {
    name?: string;
    login?: string;
    password?: string;
    role?: UserRole;
    permissions?: PermissionsMap | null;
  },
): Promise<UserListItem> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ user: UserListItem }>(res);
  return data.user;
}

export async function apiDeleteUser(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) {
    return;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? `Erro HTTP ${res.status}`);
}
