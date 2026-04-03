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

export type PermissionModule = "VENDAS" | "ESTOQUE" | "FINANCEIRO" | "COZINHA" | "CLIENTES";

export type PermissionsMap = Record<PermissionModule, string[]>;

export type UserAccess = {
  pdv: boolean;
  erp: boolean;
  manageUsers: boolean;
  kitchen: boolean;
  clients: boolean;
  /** Relatório de comandas por cliente (financeiro / listagem). */
  customerOrders: boolean;
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
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!res.ok) {
      throw new Error(
        res.status === 502 || res.status === 503
          ? "Servidor indisponível. Reinicie o backend (porta 3001) ou rode: npx prisma db push"
          : `Erro HTTP ${res.status} (resposta vazia).`,
      );
    }
    throw new Error("Resposta vazia do servidor. Verifique se a API está rodando.");
  }
  let data: T & { error?: string };
  try {
    data = JSON.parse(text) as T & { error?: string };
  } catch {
    throw new Error("Resposta inválida do servidor (não é JSON). O backend pode ter encerrado com erro.");
  }
  if (!res.ok) {
    throw new Error(data.error ?? `Erro HTTP ${res.status}`);
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

export type CashOperator = { id: string; name: string; login: string };

export type CashShift = "MANHA" | "TARDE" | "NOITE" | "CUSTOM";

export type CashSession = {
  id: string;
  openedAt: string;
  initialValue: number;
  closedAt: string | null;
  closingBalance: number | null;
  shift: CashShift;
  shiftCustomLabel: string | null;
  openingNotes: string | null;
  denominations: Record<string, number> | null;
  openedBy: CashOperator;
  closedBy: CashOperator | null;
};

export type CashMovementRow = {
  id: string;
  type: "SANGRIA" | "SUPRIMENTO";
  amount: number;
  note: string | null;
  createdAt: string;
  createdBy: CashOperator;
};

/** Indica se há turno de caixa aberto (sem valores; serve para PDV/cozinha). */
export async function apiCashOpenStatus(token: string): Promise<boolean> {
  const res = await fetch("/api/cash-register/open-status", { headers: authHeaders(token) });
  const data = await parseJson<{ open: boolean }>(res);
  return data.open;
}

export async function apiCashCurrent(token: string): Promise<CashSession | null> {
  const res = await fetch("/api/cash-register/current", { headers: authHeaders(token) });
  const data = await parseJson<{ current: CashSession | null }>(res);
  return data.current;
}

export async function apiCashHistory(token: string, limit = 50): Promise<CashSession[]> {
  const res = await fetch(`/api/cash-register/history?limit=${limit}`, {
    headers: authHeaders(token),
  });
  const data = await parseJson<{ sessions: CashSession[] }>(res);
  return data.sessions;
}

export async function apiCashSessionDetail(
  token: string,
  id: string,
): Promise<{ session: CashSession; movements: CashMovementRow[] }> {
  const res = await fetch(`/api/cash-register/sessions/${encodeURIComponent(id)}`, {
    headers: authHeaders(token),
  });
  return parseJson<{ session: CashSession; movements: CashMovementRow[] }>(res);
}

export async function apiCashOpen(
  token: string,
  body: {
    initialValue: number;
    shift?: CashShift;
    shiftCustomLabel?: string | null;
    openingNotes?: string | null;
    denominations?: Record<string, number> | null;
  },
): Promise<CashSession> {
  const res = await fetch("/api/cash-register/open", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ session: CashSession }>(res);
  return data.session;
}

export async function apiCashMovements(token: string): Promise<CashMovementRow[]> {
  const res = await fetch("/api/cash-register/movements", { headers: authHeaders(token) });
  const data = await parseJson<{ movements: CashMovementRow[] }>(res);
  return data.movements;
}

export async function apiCashAddMovement(
  token: string,
  body: { type: "SANGRIA" | "SUPRIMENTO"; amount: number; note?: string | null },
): Promise<CashMovementRow> {
  const res = await fetch("/api/cash-register/movements", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ movement: CashMovementRow }>(res);
  return data.movement;
}

export async function apiCashClose(token: string, closingBalance?: number | null): Promise<CashSession> {
  const res = await fetch("/api/cash-register/close", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ closingBalance: closingBalance ?? undefined }),
  });
  const data = await parseJson<{ session: CashSession }>(res);
  return data.session;
}

export type PdvProduct = {
  id: string;
  name: string;
  price: number;
  stock: number;
  productType: "GELADO" | "QUENTE";
  isKitchenItem: boolean;
  controlsStock: boolean;
  active: boolean;
};

export type PdvOrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isKitchenItem: boolean;
  kitchenStatus: string | null;
};

export type PaymentMethodKind = "DINHEIRO" | "DEBITO" | "CREDITO" | "VALE";

export type OrderPaymentRow = {
  id: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: PaymentMethodKind;
  amountPaid: number;
  feeAmount: number;
  netAmount: number;
  cashReceived: number | null;
};

export type PdvOrder = {
  id: string;
  kind: "DIRECT" | "COMANDA";
  customerId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  clientName: string | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  openedAt: string;
  closedAt: string | null;
  lastActivityAt?: string;
  cancelledAt?: string | null;
  closedCashRegisterId?: string | null;
  createdBy: { id: string; name: string; login: string };
  items: PdvOrderItem[];
  subtotal: number;
  payments?: OrderPaymentRow[];
  canReopen?: boolean;
};

export type PaymentMethodRow = {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  feePercent: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function apiListPaymentMethods(token: string, all = false): Promise<PaymentMethodRow[]> {
  const res = await fetch(`/api/payment-methods${all ? "?all=1" : ""}`, { headers: authHeaders(token) });
  const data = await parseJson<{ methods: PaymentMethodRow[] }>(res);
  return data.methods;
}

export async function apiCreatePaymentMethod(
  token: string,
  body: { name: string; kind: PaymentMethodKind; feePercent?: number | null },
): Promise<PaymentMethodRow> {
  const res = await fetch("/api/payment-methods", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ method: PaymentMethodRow }>(res);
  return data.method;
}

export async function apiUpdatePaymentMethod(
  token: string,
  id: string,
  body: Partial<{ name: string; kind: PaymentMethodKind; feePercent: number | null; active: boolean }>,
): Promise<PaymentMethodRow> {
  const res = await fetch(`/api/payment-methods/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ method: PaymentMethodRow }>(res);
  return data.method;
}

export async function apiDeletePaymentMethod(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/payment-methods/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (res.status === 204) {
    return;
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error ?? `Erro HTTP ${res.status}`);
}

export async function apiPdvProducts(token: string): Promise<PdvProduct[]> {
  const res = await fetch("/api/pdv/products", { headers: authHeaders(token) });
  const data = await parseJson<{ products: PdvProduct[] }>(res);
  return data.products;
}

export type PdvTodayStats = {
  closedTodayCount: number;
  closedTodayTotal: number;
  openComandasCount: number;
};

export async function apiPdvStatsToday(token: string): Promise<PdvTodayStats> {
  const res = await fetch("/api/pdv/stats/today", { headers: authHeaders(token) });
  return parseJson(res);
}

export async function apiPdvOrders(
  token: string,
  q?: {
    status?: PdvOrder["status"];
    kind?: PdvOrder["kind"];
    customerId?: string;
    search?: string;
    sort?: "stale" | "recentClosed";
    limit?: number;
    /** ISO — filtra pedidos com closedAt >= data (útil para vendas de hoje). */
    closedFrom?: string;
  },
): Promise<PdvOrder[]> {
  const params = new URLSearchParams();
  if (q?.status) {
    params.set("status", q.status);
  }
  if (q?.kind) {
    params.set("kind", q.kind);
  }
  if (q?.customerId) {
    params.set("customerId", q.customerId);
  }
  if (q?.search) {
    params.set("search", q.search);
  }
  if (q?.sort) {
    params.set("sort", q.sort);
  }
  if (q?.limit != null) {
    params.set("limit", String(q.limit));
  }
  if (q?.closedFrom) {
    params.set("closedFrom", q.closedFrom);
  }
  const qs = params.toString();
  const res = await fetch(`/api/pdv/orders${qs ? `?${qs}` : ""}`, { headers: authHeaders(token) });
  const data = await parseJson<{ orders: PdvOrder[] }>(res);
  return data.orders;
}

export async function apiPdvOrder(token: string, id: string): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${id}`, { headers: authHeaders(token) });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvCreateOrder(
  token: string,
  body: { kind: "DIRECT" | "COMANDA"; clientName?: string | null; customerId?: string | null },
): Promise<PdvOrder> {
  const res = await fetch("/api/pdv/orders", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvPatchOrder(
  token: string,
  orderId: string,
  body: { clientName?: string | null; customerId?: string | null },
): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvAddItem(
  token: string,
  orderId: string,
  productId: string,
  quantity: number,
): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/items`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ productId, quantity }),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvUpdateItemQty(
  token: string,
  orderId: string,
  itemId: string,
  quantity: number,
): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/items/${itemId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ quantity }),
  });
  const data = await parseJson<{ order: PdvOrder | null }>(res);
  if (!data.order) {
    throw new Error("Pedido não retornado");
  }
  return data.order;
}

export async function apiPdvRemoveItem(
  token: string,
  orderId: string,
  itemId: string,
): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/items/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  const data = await parseJson<{ order: PdvOrder | null }>(res);
  if (!data.order) {
    throw new Error("Pedido não retornado");
  }
  return data.order;
}

export async function apiPdvCloseOrder(
  token: string,
  orderId: string,
  payments: { paymentMethodId: string; amountPaid: number; cashReceived?: number | null }[],
): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/close`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ payments }),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvReopenOrder(token: string, orderId: string): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/reopen`, {
    method: "POST",
    headers: authHeaders(token),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export async function apiPdvCancelOrder(token: string, orderId: string, restoreStock: boolean): Promise<PdvOrder> {
  const res = await fetch(`/api/pdv/orders/${orderId}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ restoreStock }),
  });
  const data = await parseJson<{ order: PdvOrder }>(res);
  return data.order;
}

export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function apiListCustomers(token: string, q?: string): Promise<CustomerRow[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await fetch(`/api/customers${qs}`, { headers: authHeaders(token) });
  const data = await parseJson<{ customers: CustomerRow[] }>(res);
  return data.customers;
}

export async function apiCreateCustomer(
  token: string,
  body: { name: string; phone?: string | null; document?: string | null; email?: string | null; notes?: string | null },
): Promise<CustomerRow> {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ customer: CustomerRow }>(res);
  return data.customer;
}

export async function apiUpdateCustomer(
  token: string,
  id: string,
  body: Partial<{
    name: string;
    phone: string | null;
    document: string | null;
    email: string | null;
    notes: string | null;
    active: boolean;
  }>,
): Promise<CustomerRow> {
  const res = await fetch(`/api/customers/${id}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ customer: CustomerRow }>(res);
  return data.customer;
}

export type CustomerOrderReportLine = {
  id: string;
  kind: string;
  clientName: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  status: string;
  openedAt: string;
  closedAt: string | null;
  subtotal: number;
  createdBy: { id: string; name: string; login: string };
  items: { productName: string; quantity: number; unitPrice: number; lineTotal: number }[];
};

export async function apiCustomerOrdersReport(
  token: string,
  customerId: string,
  q: {
    from?: string;
    to?: string;
    status?: "OPEN" | "CLOSED" | "CANCELLED";
    kind?: "DIRECT" | "COMANDA";
  },
): Promise<{
  customer: { id: string; name: string };
  filter: { from: string; to: string; status: string; kind: string };
  orders: CustomerOrderReportLine[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (q.from) {
    params.set("from", q.from);
  }
  if (q.to) {
    params.set("to", q.to);
  }
  if (q.status) {
    params.set("status", q.status);
  }
  if (q.kind) {
    params.set("kind", q.kind);
  }
  const qs = params.toString();
  const res = await fetch(`/api/customers/${customerId}/orders${qs ? `?${qs}` : ""}`, {
    headers: authHeaders(token),
  });
  return parseJson(res);
}

export type KitchenBoardItem = {
  itemId: string;
  orderId: string;
  orderKind: "DIRECT" | "COMANDA";
  clientName: string | null;
  orderOpenedAt: string;
  minutesWaiting: number;
  productName: string;
  quantity: number;
  kitchenStatus: "PENDING" | "QUEUE" | "PREPARING" | "READY";
};

export async function apiKitchenBoard(token: string): Promise<{ items: KitchenBoardItem[]; serverTime: string }> {
  const res = await fetch("/api/kitchen/board", { headers: authHeaders(token) });
  return parseJson(res);
}

export async function apiKitchenSetStatus(
  token: string,
  itemId: string,
  status: "PREPARING" | "READY",
): Promise<{ item: KitchenBoardItem }> {
  const res = await fetch(`/api/kitchen/items/${itemId}/status`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status }),
  });
  return parseJson(res);
}
