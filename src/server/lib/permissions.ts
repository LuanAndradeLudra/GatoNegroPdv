import type { UserRole } from "@prisma/client";

export const PERMISSION_MODULES = ["VENDAS", "ESTOQUE", "FINANCEIRO", "COZINHA", "CLIENTES"] as const;
export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const MODULE_ACTIONS: Record<PermissionModule, readonly string[]> = {
  VENDAS: ["abrir", "fechar", "desconto"],
  ESTOQUE: ["entrada", "saida", "ajuste"],
  FINANCEIRO: ["relatorios"],
  COZINHA: ["ver", "atualizar"],
  CLIENTES: ["cadastrar", "ver", "editar"],
};

export type PermissionsMap = Record<PermissionModule, string[]>;

function emptyMap(): PermissionsMap {
  return {
    VENDAS: [],
    ESTOQUE: [],
    FINANCEIRO: [],
    COZINHA: [],
    CLIENTES: [],
  };
}

function fullModule(mod: PermissionModule): string[] {
  return [...MODULE_ACTIONS[mod]];
}

export function defaultPermissionsForRole(role: UserRole): PermissionsMap {
  const m = emptyMap();
  switch (role) {
    case "ADMIN":
    case "GERENTE":
      for (const mod of PERMISSION_MODULES) {
        m[mod] = fullModule(mod);
      }
      break;
    case "VENDEDOR":
      m.VENDAS = fullModule("VENDAS");
      m.CLIENTES = ["cadastrar", "ver", "editar"];
      break;
    case "ESTOQUE":
      m.ESTOQUE = fullModule("ESTOQUE");
      break;
    case "COZINHA":
      m.COZINHA = fullModule("COZINHA");
      break;
    case "CONFERENTE":
      m.VENDAS = ["abrir"];
      m.ESTOQUE = ["entrada", "saida"];
      break;
    default:
      break;
  }
  return m;
}

function sanitizeModuleActions(mod: PermissionModule, actions: unknown): string[] {
  if (!Array.isArray(actions)) {
    return [];
  }
  const allowed = new Set(MODULE_ACTIONS[mod]);
  return actions.filter((a): a is string => typeof a === "string" && allowed.has(a));
}

/** Mescla padrão do papel com JSON salvo (parcial) no usuário. */
export function resolvePermissions(user: {
  role: UserRole;
  permissions: unknown;
}): PermissionsMap {
  const base = defaultPermissionsForRole(user.role);
  if (user.permissions == null || typeof user.permissions !== "object" || Array.isArray(user.permissions)) {
    return base;
  }
  const raw = user.permissions as Record<string, unknown>;
  const out: PermissionsMap = { ...base };
  for (const mod of PERMISSION_MODULES) {
    if (raw[mod] !== undefined) {
      out[mod] = sanitizeModuleActions(mod, raw[mod]);
    }
  }
  return out;
}

export function hasPermission(map: PermissionsMap, mod: PermissionModule, action: string): boolean {
  return map[mod]?.includes(action) ?? false;
}

export function hasAnyModuleAction(map: PermissionsMap, mod: PermissionModule): boolean {
  return (map[mod]?.length ?? 0) > 0;
}

export function canManageUsers(role: UserRole): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

/** Hub: PDV — vendas ou papéis operacionais de frente. */
export function canOpenPdv(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR") {
    return true;
  }
  if (hasAnyModuleAction(map, "VENDAS")) {
    return true;
  }
  if (role === "CONFERENTE") {
    return true;
  }
  return false;
}

/** Hub: ERP — gestão / estoque / financeiro. */
export function canOpenErp(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE" || role === "ESTOQUE") {
    return true;
  }
  if (hasAnyModuleAction(map, "ESTOQUE") || hasAnyModuleAction(map, "FINANCEIRO")) {
    return true;
  }
  return false;
}

/** Tela cozinha: ver fila / status. */
export function canAccessKitchen(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE") {
    return true;
  }
  if (role === "COZINHA") {
    return true;
  }
  return hasPermission(map, "COZINHA", "ver") || hasPermission(map, "COZINHA", "atualizar");
}

/** Avançar status (preparar / pronto). */
export function canUpdateKitchen(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE") {
    return true;
  }
  return hasPermission(map, "COZINHA", "atualizar");
}

/** Cadastro / lista de clientes (hub Clientes, PDV vínculo). */
export function canAccessClients(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE") {
    return true;
  }
  return hasAnyModuleAction(map, "CLIENTES");
}

/** Relatório de comandas por cliente (fim de mês etc.). */
export function canViewCustomerOrders(role: UserRole, map: PermissionsMap): boolean {
  if (role === "ADMIN" || role === "GERENTE") {
    return true;
  }
  if (hasPermission(map, "FINANCEIRO", "relatorios")) {
    return true;
  }
  return hasPermission(map, "CLIENTES", "ver");
}

export function parsePermissionsInput(raw: unknown): Partial<PermissionsMap> | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const partial: Partial<PermissionsMap> = {};
  for (const mod of PERMISSION_MODULES) {
    if (o[mod] !== undefined) {
      partial[mod] = sanitizeModuleActions(mod, o[mod]);
    }
  }
  return partial;
}

export function mergePermissionsInput(
  role: UserRole,
  partial: Partial<PermissionsMap> | null,
): PermissionsMap {
  const base = defaultPermissionsForRole(role);
  if (!partial) {
    return base;
  }
  const out: PermissionsMap = { ...base };
  for (const mod of PERMISSION_MODULES) {
    if (partial[mod] !== undefined) {
      out[mod] = partial[mod]!;
    }
  }
  return out;
}
