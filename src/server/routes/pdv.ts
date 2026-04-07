import { Router } from "express";
import {
  Prisma,
  type CommercialChargeMode,
  type OrderKind,
  type OrderStatus,
  type PaymentMethodKind,
} from "@prisma/client";
import { computeCommercialAmounts } from "../lib/orderCommercial.js";
import { prisma } from "../lib/prisma.js";
import { authMiddleware, verifyJwtToPayload } from "../middleware/auth.js";
import { requireOpenCashRegister, requirePdvAccess } from "../middleware/pdvAccess.js";
import { canOpenPdv, resolvePermissions } from "../lib/permissions.js";
import { notifyStockChanged, registerStockSseClient } from "../lib/stockBroadcast.js";

export const pdvRouter = Router();

/** SSE: token em `Authorization: Bearer` ou `?token=` (EventSource). */
pdvRouter.get("/stock-stream", async (req, res) => {
  const header = req.headers.authorization;
  const token =
    header?.startsWith("Bearer ") ? header.slice(7) : typeof req.query.token === "string" ? req.query.token : null;
  const payload = token ? verifyJwtToPayload(token) : null;
  if (!payload) {
    res.status(401).end();
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    res.status(401).end();
    return;
  }
  const map = resolvePermissions(user);
  if (!canOpenPdv(user.role, map)) {
    res.status(403).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as { flushHeaders?: () => void }).flushHeaders?.();
  const unsub = registerStockSseClient(res);
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      clearInterval(ping);
      unsub();
    }
  }, 25000);
  req.on("close", () => {
    clearInterval(ping);
    unsub();
  });
});

pdvRouter.use(authMiddleware);
pdvRouter.use(requirePdvAccess);

const productSelect = {
  id: true,
  name: true,
  price: true,
  stock: true,
  minStock: true,
  isKitchenItem: true,
  controlsStock: true,
  active: true,
  category: { select: { id: true, name: true } },
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const CHARGE_MODES: CommercialChargeMode[] = ["PERCENT", "FIXED"];

function parseChargeMode(raw: unknown): CommercialChargeMode | undefined {
  return typeof raw === "string" && CHARGE_MODES.includes(raw as CommercialChargeMode)
    ? (raw as CommercialChargeMode)
    : undefined;
}

pdvRouter.get("/products", async (req, res) => {
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId.trim() : "";
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: productSelect,
  });

  let reservedMap = new Map<string, number>();
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true } });
    if (order?.status === "OPEN") {
      const stockIds = rows.filter((r) => r.controlsStock).map((r) => r.id);
      if (stockIds.length > 0) {
        const grouped = await prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            productId: { in: stockIds },
            orderId: { not: orderId },
            order: { status: "OPEN" },
          },
          _sum: { quantity: true },
        });
        reservedMap = new Map(grouped.map((g) => [g.productId, round2(g._sum.quantity ?? 0)]));
      }
    }
  }

  res.json({
    products: rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      stock: r.stock,
      minStock: r.minStock,
      isKitchenItem: r.isKitchenItem,
      controlsStock: r.controlsStock,
      active: r.active,
      category: r.category ? { id: r.category.id, name: r.category.name } : null,
      availableForOrder:
        orderId && r.controlsStock ? round2(r.stock - (reservedMap.get(r.id) ?? 0)) : null,
    })),
  });
});

const orderInclude = {
  createdBy: { select: { id: true, name: true, login: true } },
  closedBy: { select: { id: true, name: true, login: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    include: {
      product: { select: { name: true, isKitchenItem: true, controlsStock: true, stock: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

const orderIncludeWithPayments = {
  ...orderInclude,
  payments: {
    include: {
      paymentMethod: { select: { id: true, name: true, kind: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

type SerializedPayment = {
  id: string;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodKind: PaymentMethodKind;
  amountPaid: number;
  feeAmount: number;
  netAmount: number;
  cashReceived: number | null;
};

async function serializeOrder(
  order: {
    id: string;
    kind: OrderKind;
    clientName: string | null;
    customerId: string | null;
    customer: { id: string; name: string; phone: string | null } | null;
    status: OrderStatus;
    openedAt: Date;
    closedAt: Date | null;
    lastActivityAt?: Date | null;
    cancelledAt: Date | null;
    closedCashRegisterId: string | null;
    closedById: string | null;
    createdById: string;
    createdBy: { id: string; name: string; login: string };
    closedBy: { id: string; name: string; login: string } | null;
    couvertEnabled: boolean;
    couvertMode: CommercialChargeMode;
    couvertValue: number;
    serviceFeeEnabled: boolean;
    serviceFeeMode: CommercialChargeMode;
    serviceFeeValue: number;
    items: {
      id: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      kitchenStatus: string | null;
      product: { name: string; isKitchenItem: boolean; controlsStock: boolean; stock: number };
    }[];
    payments?: {
      id: string;
      paymentMethodId: string;
      amountPaid: number;
      feeAmount: number;
      netAmount: number;
      cashReceived: number | null;
      paymentMethod: { id: string; name: string; kind: PaymentMethodKind };
    }[];
  },
  extra?: { canReopen?: boolean },
) {
  let reservedMap = new Map<string, number>();
  if (order.status === "OPEN") {
    const stockIds = [...new Set(order.items.filter((i) => i.product.controlsStock).map((i) => i.productId))];
    if (stockIds.length > 0) {
      const grouped = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { in: stockIds },
          orderId: { not: order.id },
          order: { status: "OPEN" },
        },
        _sum: { quantity: true },
      });
      reservedMap = new Map(grouped.map((g) => [g.productId, round2(g._sum.quantity ?? 0)]));
    }
  }

  const items = order.items.map((i) => {
    const lineTotal = round2(i.quantity * i.unitPrice);
    const base = {
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal,
      isKitchenItem: i.product.isKitchenItem,
      kitchenStatus: i.kitchenStatus,
      controlsStock: i.product.controlsStock,
    };
    if (order.status !== "OPEN" || !i.product.controlsStock) {
      return {
        ...base,
        stockPhysical: null as number | null,
        reservedElsewhere: null as number | null,
        maxQuantity: null as number | null,
      };
    }
    const physical = round2(i.product.stock);
    const other = reservedMap.get(i.productId) ?? 0;
    const maxQuantity = round2(physical - other);
    return {
      ...base,
      stockPhysical: physical,
      reservedElsewhere: other,
      maxQuantity,
    };
  });
  const itemsSubtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const comm = computeCommercialAmounts(itemsSubtotal, {
    couvertEnabled: order.couvertEnabled,
    couvertMode: order.couvertMode,
    couvertValue: order.couvertValue,
    serviceFeeEnabled: order.serviceFeeEnabled,
    serviceFeeMode: order.serviceFeeMode,
    serviceFeeValue: order.serviceFeeValue,
  });

  let paymentsOut: SerializedPayment[] | undefined;
  if (order.payments && order.payments.length > 0) {
    paymentsOut = order.payments.map((p) => ({
      id: p.id,
      paymentMethodId: p.paymentMethodId,
      paymentMethodName: p.paymentMethod.name,
      paymentMethodKind: p.paymentMethod.kind,
      amountPaid: p.amountPaid,
      feeAmount: p.feeAmount,
      netAmount: p.netAmount,
      cashReceived: p.cashReceived,
    }));
  }

  return {
    id: order.id,
    kind: order.kind,
    clientName: order.clientName,
    customerId: order.customerId,
    customer: order.customer
      ? { id: order.customer.id, name: order.customer.name, phone: order.customer.phone }
      : null,
    status: order.status,
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    lastActivityAt: (order.lastActivityAt ?? order.openedAt).toISOString(),
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    closedCashRegisterId: order.closedCashRegisterId,
    createdBy: order.createdBy,
    closedBy: order.closedBy,
    items,
    subtotal: itemsSubtotal,
    couvertAmount: comm.couvertAmount,
    serviceFeeAmount: comm.serviceFeeAmount,
    totalDue: comm.totalDue,
    couvertEnabled: order.couvertEnabled,
    couvertMode: order.couvertMode,
    couvertValue: order.couvertValue,
    serviceFeeEnabled: order.serviceFeeEnabled,
    serviceFeeMode: order.serviceFeeMode,
    serviceFeeValue: order.serviceFeeValue,
    payments: paymentsOut,
    canReopen: extra?.canReopen,
  };
}

async function assertPdvStockForLine(orderId: string, productId: string, newQtyInCurrentOrder: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.controlsStock) {
    return;
  }
  const physical = round2(product.stock);
  const agg = await prisma.orderItem.aggregate({
    where: {
      productId,
      orderId: { not: orderId },
      order: { status: "OPEN" },
    },
    _sum: { quantity: true },
  });
  const other = round2(agg._sum.quantity ?? 0);
  const maxAllowed = round2(physical - other);
  if (newQtyInCurrentOrder > maxAllowed + 0.0001) {
    throw new Error(
      `Estoque insuficiente para "${product.name}". Máximo neste pedido: ${maxAllowed} un. (estoque físico ${physical}; ` +
        (other > 0 ? `outras comandas abertas: ${other}` : "sem reserva em outras comandas") +
        ").",
    );
  }
}

async function getOpenCashRegisterId(): Promise<string | null> {
  const open = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true },
  });
  return open?.id ?? null;
}

async function bumpOrderActivity(orderId: string): Promise<void> {
  await prisma.order.update({
    where: { id: orderId },
    data: { lastActivityAt: new Date() },
  });
}

async function decrementStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: {
      product: { select: { id: true, name: true, controlsStock: true, stock: true } },
    },
  });
  for (const it of items) {
    if (!it.product.controlsStock) {
      continue;
    }
    const next = round2(it.product.stock - it.quantity);
    if (next < -0.0001) {
      throw new Error(`Estoque insuficiente para "${it.product.name}".`);
    }
    await tx.product.update({
      where: { id: it.productId },
      data: { stock: next },
    });
  }
}

async function incrementStockTx(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: {
      product: { select: { id: true, name: true, controlsStock: true, stock: true } },
    },
  });
  for (const it of items) {
    if (!it.product.controlsStock) {
      continue;
    }
    const next = round2(it.product.stock + it.quantity);
    await tx.product.update({
      where: { id: it.productId },
      data: { stock: next },
    });
  }
}

/** Estorno de venda fechada: devolve estoque, exceto itens de cozinha marcados como desperdício. */
async function incrementStockForCancel(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string,
  kitchenRestore: Record<string, "return" | "waste"> | undefined,
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId },
    include: {
      product: { select: { id: true, name: true, controlsStock: true, stock: true, isKitchenItem: true } },
    },
  });
  for (const it of items) {
    if (!it.product.controlsStock) {
      continue;
    }
    const waste = it.product.isKitchenItem && kitchenRestore?.[it.id] === "waste";
    if (waste) {
      const stock = round2(it.product.stock);
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          kind: "SAIDA",
          balanceBefore: stock,
          balanceAfter: stock,
          note: `Perda (estorno) — ${it.quantity} un. de "${it.product.name}" não retornadas ao estoque`,
          createdById: userId,
        },
      });
      continue;
    }
    const next = round2(it.product.stock + it.quantity);
    await tx.product.update({
      where: { id: it.productId },
      data: { stock: next },
    });
  }
}

/** Resumo do dia (timezone do servidor) para o dashboard. */
pdvRouter.get("/stats/today", async (_req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const closedToday = await prisma.order.findMany({
    where: {
      status: "CLOSED",
      closedAt: { gte: start, lt: end },
    },
    include: {
      payments: true,
      items: {
        include: {
          product: { select: { name: true, isKitchenItem: true } },
        },
      },
      createdBy: { select: { id: true, name: true, login: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  let closedTodayTotalNet = 0;
  for (const o of closedToday) {
    if (o.payments.length > 0) {
      for (const p of o.payments) {
        closedTodayTotalNet += p.netAmount;
      }
    } else {
      let sub = 0;
      for (const it of o.items) {
        sub += round2(it.quantity * it.unitPrice);
      }
      closedTodayTotalNet += round2(sub);
    }
  }
  closedTodayTotalNet = round2(closedTodayTotalNet);

  const openComandasCount = await prisma.order.count({
    where: { status: "OPEN", kind: "COMANDA" },
  });

  res.json({
    closedTodayCount: closedToday.length,
    closedTodayTotal: closedTodayTotalNet,
    openComandasCount,
  });
});

pdvRouter.get("/orders", async (req, res) => {
  const status = req.query.status as OrderStatus | undefined;
  const kind = req.query.kind as OrderKind | undefined;
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId.trim() : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const sort = typeof req.query.sort === "string" ? req.query.sort : "";
  const closedFromRaw = typeof req.query.closedFrom === "string" ? req.query.closedFrom.trim() : "";

  const where: Prisma.OrderWhereInput = {};
  if (status && ["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
    where.status = status;
  }
  if (kind && ["DIRECT", "COMANDA"].includes(kind)) {
    where.kind = kind;
  }
  if (customerId) {
    where.customerId = customerId;
  }
  if (search) {
    where.OR = [
      { clientName: { contains: search, mode: Prisma.QueryMode.insensitive } },
      { customer: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } },
    ];
  }
  if (closedFromRaw) {
    const d = new Date(closedFromRaw);
    if (!Number.isNaN(d.getTime())) {
      where.closedAt = { gte: d };
    }
  }

  let orderBy: Prisma.OrderOrderByWithRelationInput[] = [{ openedAt: "desc" }];
  if (sort === "stale") {
    orderBy = [{ lastActivityAt: "asc" }];
  } else if (sort === "recentClosed") {
    orderBy = [{ closedAt: "desc" }];
  }

  const rawTake = req.query.limit;
  const take = Math.min(100, Math.max(1, Number(rawTake) || 100));

  const rows = await prisma.order.findMany({
    where,
    orderBy,
    take,
    include: orderInclude,
  });
  const openCashId = await getOpenCashRegisterId();
  const orders = await Promise.all(
    rows.map(async (o) => {
      const canReopen =
        o.status === "CLOSED" &&
        !!o.closedCashRegisterId &&
        !!openCashId &&
        o.closedCashRegisterId === openCashId;
      return serializeOrder(o, { canReopen });
    }),
  );
  res.json({ orders });
});

pdvRouter.get("/orders/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: orderIncludeWithPayments,
  });
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  const openId = await getOpenCashRegisterId();
  const canReopen =
    order.status === "CLOSED" &&
    !!order.closedCashRegisterId &&
    !!openId &&
    order.closedCashRegisterId === openId;

  res.json({ order: await serializeOrder(order, { canReopen }) });
});

pdvRouter.post("/orders", requireOpenCashRegister, async (req, res) => {
  const kind = req.body?.kind as OrderKind | undefined;
  if (kind !== "DIRECT" && kind !== "COMANDA") {
    res.status(400).json({ error: "Informe o tipo: DIRECT ou COMANDA." });
    return;
  }
  const clientName =
    typeof req.body?.clientName === "string" ? req.body.clientName.trim() || null : null;
  const customerIdRaw = req.body?.customerId;
  let customerId: string | null = null;
  if (typeof customerIdRaw === "string" && customerIdRaw.trim()) {
    const cust = await prisma.customer.findFirst({
      where: { id: customerIdRaw.trim(), active: true },
    });
    if (!cust) {
      res.status(400).json({ error: "Cliente não encontrado ou inativo." });
      return;
    }
    customerId = cust.id;
  }

  const settings =
    (await prisma.commercialSettings.findUnique({ where: { id: "default" } })) ??
    (await prisma.commercialSettings.create({ data: { id: "default" } }));

  const created = await prisma.order.create({
    data: {
      kind,
      clientName,
      customerId,
      createdById: req.user!.sub,
      couvertEnabled: settings.couvertEnabled,
      couvertMode: settings.couvertMode,
      couvertValue: settings.couvertValue,
      serviceFeeEnabled: settings.serviceFeeEnabled,
      serviceFeeMode: settings.serviceFeeMode,
      serviceFeeValue: settings.serviceFeeValue,
    },
    include: orderInclude,
  });

  res.status(201).json({ order: await serializeOrder(created) });
});

pdvRouter.patch("/orders/:id", requireOpenCashRegister, async (req, res) => {
  const orderId = req.params.id;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido não encontrado ou já encerrado." });
    return;
  }

  const data: Prisma.OrderUpdateInput = {};

  if (req.body?.clientName !== undefined) {
    data.clientName =
      typeof req.body.clientName === "string" ? req.body.clientName.trim() || null : null;
  }

  if (req.body?.customerId !== undefined) {
    const raw = req.body.customerId;
    if (raw === null || raw === "") {
      data.customer = { disconnect: true };
    } else if (typeof raw === "string") {
      const cust = await prisma.customer.findFirst({
        where: { id: raw.trim(), active: true },
      });
      if (!cust) {
        res.status(400).json({ error: "Cliente não encontrado ou inativo." });
        return;
      }
      data.customer = { connect: { id: cust.id } };
    }
  }

  if (typeof req.body?.couvertEnabled === "boolean") {
    data.couvertEnabled = req.body.couvertEnabled;
  }
  if (req.body?.couvertMode !== undefined) {
    const m = parseChargeMode(req.body.couvertMode);
    if (!m) {
      res.status(400).json({ error: "couvertMode inválido (PERCENT ou FIXED)." });
      return;
    }
    data.couvertMode = m;
  }
  if (req.body?.couvertValue !== undefined) {
    const n =
      typeof req.body.couvertValue === "number"
        ? req.body.couvertValue
        : Number.parseFloat(String(req.body.couvertValue).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "couvertValue inválido." });
      return;
    }
    const mode = (req.body?.couvertMode !== undefined ? parseChargeMode(req.body.couvertMode) : null) ?? order.couvertMode;
    if (mode === "PERCENT" && n > 100) {
      res.status(400).json({ error: "Couvert em % não pode exceder 100." });
      return;
    }
    data.couvertValue = round2(n);
  }

  if (typeof req.body?.serviceFeeEnabled === "boolean") {
    data.serviceFeeEnabled = req.body.serviceFeeEnabled;
  }
  if (req.body?.serviceFeeMode !== undefined) {
    const m = parseChargeMode(req.body.serviceFeeMode);
    if (!m) {
      res.status(400).json({ error: "serviceFeeMode inválido (PERCENT ou FIXED)." });
      return;
    }
    data.serviceFeeMode = m;
  }
  if (req.body?.serviceFeeValue !== undefined) {
    const n =
      typeof req.body.serviceFeeValue === "number"
        ? req.body.serviceFeeValue
        : Number.parseFloat(String(req.body.serviceFeeValue).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "serviceFeeValue inválido." });
      return;
    }
    const mode =
      (req.body?.serviceFeeMode !== undefined ? parseChargeMode(req.body.serviceFeeMode) : null) ?? order.serviceFeeMode;
    if (mode === "PERCENT" && n > 100) {
      res.status(400).json({ error: "Taxa de serviço em % não pode exceder 100." });
      return;
    }
    data.serviceFeeValue = round2(n);
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data,
    include: orderInclude,
  });

  res.json({ order: await serializeOrder(updated) });
});

pdvRouter.post("/orders/:id/items", requireOpenCashRegister, async (req, res) => {
  const orderId = req.params.id;
  const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
  const rawQty = req.body?.quantity;
  const quantity =
    typeof rawQty === "number"
      ? rawQty
      : typeof rawQty === "string"
        ? Number.parseFloat(rawQty.replace(",", "."))
        : NaN;

  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: "Produto e quantidade válidos são obrigatórios." });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido não encontrado ou já encerrado." });
    return;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.active) {
    res.status(404).json({ error: "Produto não disponível." });
    return;
  }

  const existing = await prisma.orderItem.findFirst({
    where: { orderId, productId },
  });

  const q = Math.round(quantity * 1000) / 1000;
  const unitPrice = product.price;

  if (existing) {
    const newQty = Math.round((existing.quantity + q) * 1000) / 1000;
    try {
      await assertPdvStockForLine(orderId, productId, newQty);
    } catch (e) {
      res.status(409).json({ error: e instanceof Error ? e.message : "Estoque insuficiente." });
      return;
    }
    await prisma.orderItem.update({
      where: { id: existing.id },
      data: {
        quantity: newQty,
        unitPrice,
      },
    });
    await bumpOrderActivity(orderId);
    const full = await prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    if (!full) {
      res.status(500).json({ error: "Erro ao recarregar pedido." });
      return;
    }
    notifyStockChanged();
    res.status(200).json({ order: await serializeOrder(full) });
    return;
  }

  try {
    await assertPdvStockForLine(orderId, productId, q);
  } catch (e) {
    res.status(409).json({ error: e instanceof Error ? e.message : "Estoque insuficiente." });
    return;
  }

  const kitchenStatus = product.isKitchenItem ? "QUEUE" : null;

  await prisma.orderItem.create({
    data: {
      orderId,
      productId,
      quantity: q,
      unitPrice,
      kitchenStatus,
    },
  });
  await bumpOrderActivity(orderId);

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  if (!full) {
    res.status(500).json({ error: "Erro ao recarregar pedido." });
    return;
  }
  notifyStockChanged();
  res.status(201).json({ order: await serializeOrder(full) });
});

pdvRouter.patch("/orders/:orderId/items/:itemId", requireOpenCashRegister, async (req, res) => {
  const { orderId, itemId } = req.params;
  const rawQty = req.body?.quantity;
  const quantity =
    typeof rawQty === "number"
      ? rawQty
      : typeof rawQty === "string"
        ? Number.parseFloat(rawQty.replace(",", "."))
        : NaN;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: "Quantidade inválida." });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido não encontrado ou já encerrado." });
    return;
  }

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
  });
  if (!item) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }

  const q = Math.round(quantity * 1000) / 1000;
  try {
    await assertPdvStockForLine(orderId, item.productId, q);
  } catch (e) {
    res.status(409).json({ error: e instanceof Error ? e.message : "Estoque insuficiente." });
    return;
  }
  await prisma.orderItem.update({
    where: { id: itemId },
    data: { quantity: q },
  });
  await bumpOrderActivity(orderId);

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  notifyStockChanged();
  res.json({ order: full ? await serializeOrder(full) : null });
});

pdvRouter.delete("/orders/:orderId/items/:itemId", requireOpenCashRegister, async (req, res) => {
  const { orderId, itemId } = req.params;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido não encontrado ou já encerrado." });
    return;
  }

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
  });
  if (!item) {
    res.status(404).json({ error: "Item não encontrado." });
    return;
  }

  await prisma.orderItem.delete({ where: { id: itemId } });
  await bumpOrderActivity(orderId);

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  notifyStockChanged();
  res.json({ order: full ? await serializeOrder(full) : null });
});

type PaymentLineInput = {
  paymentMethodId: string;
  amountPaid: number;
  /** JSON pode vir como string; dinheiro pode informar troco. */
  cashReceived?: number | string | null;
};

pdvRouter.post("/orders/:id/close", requireOpenCashRegister, async (req, res) => {
  const orderId = req.params.id;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido não encontrado ou já encerrado." });
    return;
  }

  if (order.kind === "DIRECT" && order.items.length === 0) {
    res.status(400).json({ error: "Inclua ao menos um item na venda direta." });
    return;
  }

  const itemsSubtotal = round2(
    order.items.reduce((s, it) => s + round2(it.quantity * it.unitPrice), 0),
  );
  const { totalDue } = computeCommercialAmounts(itemsSubtotal, {
    couvertEnabled: order.couvertEnabled,
    couvertMode: order.couvertMode,
    couvertValue: order.couvertValue,
    serviceFeeEnabled: order.serviceFeeEnabled,
    serviceFeeMode: order.serviceFeeMode,
    serviceFeeValue: order.serviceFeeValue,
  });

  const paymentsRaw = req.body?.payments as PaymentLineInput[] | undefined;
  if (totalDue > 0.001 && (!Array.isArray(paymentsRaw) || paymentsRaw.length === 0)) {
    res.status(400).json({ error: "Informe as formas de pagamento." });
    return;
  }

  const cashId = await getOpenCashRegisterId();
  if (!cashId) {
    res.status(409).json({ error: "Não há caixa aberto." });
    return;
  }

  const closedById = req.user!.sub;

  if (totalDue <= 0.001) {
    const closed = await prisma.$transaction(async (tx) => {
      await decrementStockTx(tx, orderId);
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedCashRegisterId: cashId,
          closedById,
        },
        include: orderIncludeWithPayments,
      });
    });
    notifyStockChanged();
    res.json({ order: await serializeOrder(closed) });
    return;
  }

  const methodIds = [...new Set(paymentsRaw!.map((p) => p.paymentMethodId))];
  const methods = await prisma.paymentMethod.findMany({
    where: { id: { in: methodIds }, active: true },
  });
  if (methods.length !== methodIds.length) {
    res.status(400).json({ error: "Uma ou mais formas de pagamento são inválidas ou inativas." });
    return;
  }
  const methodMap = new Map(methods.map((m) => [m.id, m]));

  let sumPaid = 0;
  const rows: {
    paymentMethodId: string;
    amountPaid: number;
    feeAmount: number;
    netAmount: number;
    cashReceived: number | null;
  }[] = [];

  for (const line of paymentsRaw!) {
    const amountPaid = round2(Number(line.amountPaid));
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
      res.status(400).json({ error: "Cada parcela deve ter valor positivo." });
      return;
    }
    const m = methodMap.get(line.paymentMethodId);
    if (!m) {
      res.status(400).json({ error: "Forma de pagamento inválida." });
      return;
    }
    const feePct = m.feePercent ?? 0;
    const feeAmount = round2((amountPaid * feePct) / 100);
    const netAmount = round2(amountPaid - feeAmount);

    let cashReceived: number | null = null;
    const rawCash = line.cashReceived;
    const hasCashReceived =
      rawCash !== undefined &&
      rawCash !== null &&
      !(typeof rawCash === "string" && rawCash.trim() === "");

    if (m.kind === "DINHEIRO") {
      if (hasCashReceived) {
        const cr = round2(Number(rawCash));
        if (!Number.isFinite(cr) || cr < amountPaid) {
          res.status(400).json({ error: "Valor recebido em dinheiro deve ser ≥ ao valor da parcela." });
          return;
        }
        cashReceived = cr;
      }
    } else if (hasCashReceived) {
      res.status(400).json({ error: "Valor recebido só se aplica a dinheiro." });
      return;
    }

    sumPaid = round2(sumPaid + amountPaid);
    rows.push({
      paymentMethodId: m.id,
      amountPaid,
      feeAmount,
      netAmount,
      cashReceived,
    });
  }

  if (Math.abs(sumPaid - totalDue) > 0.02) {
    res.status(400).json({
      error: `Total pago (${sumPaid.toFixed(2)}) deve ser igual ao pedido (${totalDue.toFixed(2)}).`,
    });
    return;
  }

  try {
    const closed = await prisma.$transaction(async (tx) => {
      await decrementStockTx(tx, orderId);
      for (const r of rows) {
        await tx.orderPayment.create({
          data: {
            orderId,
            paymentMethodId: r.paymentMethodId,
            amountPaid: r.amountPaid,
            feeAmount: r.feeAmount,
            netAmount: r.netAmount,
            cashReceived: r.cashReceived,
          },
        });
      }
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedCashRegisterId: cashId,
          closedById,
        },
        include: orderIncludeWithPayments,
      });
    });
    notifyStockChanged();
    res.json({ order: await serializeOrder(closed) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao fechar pedido.";
    res.status(400).json({ error: msg });
  }
});

pdvRouter.post("/orders/:id/reopen", requireOpenCashRegister, async (req, res) => {
  const orderId = req.params.id;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.status !== "CLOSED") {
    res.status(409).json({ error: "Pedido não encontrado ou não está fechado." });
    return;
  }
  const openId = await getOpenCashRegisterId();
  if (!order.closedCashRegisterId || !openId || order.closedCashRegisterId !== openId) {
    res.status(403).json({
      error: "Só é possível reabrir no mesmo turno de caixa em que a venda foi fechada, com o caixa ainda aberto.",
    });
    return;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderPayment.deleteMany({ where: { orderId } });
      await incrementStockTx(tx, orderId);
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "OPEN",
          closedAt: null,
          closedCashRegisterId: null,
          closedById: null,
        },
        include: orderInclude,
      });
    });
    notifyStockChanged();
    res.json({ order: await serializeOrder(updated) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao reabrir.";
    res.status(400).json({ error: msg });
  }
});

pdvRouter.post("/orders/:id/cancel", requireOpenCashRegister, async (req, res) => {
  const orderId = req.params.id;
  const restoreStock = Boolean(req.body?.restoreStock);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  if (order.status === "CANCELLED") {
    res.status(409).json({ error: "Pedido já está cancelado." });
    return;
  }

  if (order.status === "OPEN") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      include: orderInclude,
    });
    const full = await prisma.order.findUnique({
      where: { id: orderId },
      include: orderInclude,
    });
    res.json({ order: full ? await serializeOrder(full) : null });
    return;
  }

  if (order.status === "CLOSED") {
    const rawKr = req.body?.kitchenItemRestore;
    let kitchenRestore: Record<string, "return" | "waste"> | undefined;
    if (rawKr && typeof rawKr === "object" && !Array.isArray(rawKr)) {
      kitchenRestore = {};
      for (const [k, v] of Object.entries(rawKr)) {
        if (v === "waste" || v === "return") {
          kitchenRestore[k] = v;
        }
      }
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.orderPayment.deleteMany({ where: { orderId } });
        if (restoreStock) {
          await incrementStockForCancel(tx, orderId, req.user!.sub, kitchenRestore);
        }
        return tx.order.update({
          where: { id: orderId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
          },
          include: orderIncludeWithPayments,
        });
      });
      notifyStockChanged();
      res.json({ order: await serializeOrder(updated) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cancelar.";
      res.status(400).json({ error: msg });
    }
    return;
  }

  res.status(409).json({ error: "Estado do pedido não permite cancelamento." });
});
