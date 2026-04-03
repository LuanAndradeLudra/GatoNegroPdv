import { Router } from "express";
import type { OrderKind, OrderStatus, PaymentMethodKind, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireOpenCashRegister, requirePdvAccess } from "../middleware/pdvAccess.js";

export const pdvRouter = Router();

pdvRouter.use(authMiddleware);
pdvRouter.use(requirePdvAccess);

const productSelect = {
  id: true,
  name: true,
  price: true,
  stock: true,
  productType: true,
  isKitchenItem: true,
  controlsStock: true,
  active: true,
} as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

pdvRouter.get("/products", async (_req, res) => {
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: productSelect,
  });
  res.json({ products: rows });
});

const orderInclude = {
  createdBy: { select: { id: true, name: true, login: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    include: {
      product: { select: { name: true, isKitchenItem: true } },
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

function serializeOrder(
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
    createdById: string;
    createdBy: { id: string; name: string; login: string };
    items: {
      id: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      kitchenStatus: string | null;
      product: { name: string; isKitchenItem: boolean };
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
  const items = order.items.map((i) => {
    const lineTotal = round2(i.quantity * i.unitPrice);
    return {
      id: i.id,
      productId: i.productId,
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal,
      isKitchenItem: i.product.isKitchenItem,
      kitchenStatus: i.kitchenStatus,
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));

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
    items,
    subtotal,
    payments: paymentsOut,
    canReopen: extra?.canReopen,
  };
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
      product: { select: { id: true, controlsStock: true, stock: true } },
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
      { clientName: { contains: search } },
      { customer: { name: { contains: search } } },
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
  res.json({
    orders: rows.map((o) => {
      const canReopen =
        o.status === "CLOSED" &&
        !!o.closedCashRegisterId &&
        !!openCashId &&
        o.closedCashRegisterId === openCashId;
      return serializeOrder(o, { canReopen });
    }),
  });
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

  res.json({ order: serializeOrder(order, { canReopen }) });
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

  const created = await prisma.order.create({
    data: {
      kind,
      clientName,
      customerId,
      createdById: req.user!.sub,
    },
    include: orderInclude,
  });

  res.status(201).json({ order: serializeOrder(created) });
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

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data,
    include: orderInclude,
  });

  res.json({ order: serializeOrder(updated) });
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
    res.status(200).json({ order: serializeOrder(full) });
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
  res.status(201).json({ order: serializeOrder(full) });
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
  await prisma.orderItem.update({
    where: { id: itemId },
    data: { quantity: q },
  });
  await bumpOrderActivity(orderId);

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  res.json({ order: full ? serializeOrder(full) : null });
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
  res.json({ order: full ? serializeOrder(full) : null });
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

  const subtotal = round2(
    order.items.reduce((s, it) => s + round2(it.quantity * it.unitPrice), 0),
  );

  const paymentsRaw = req.body?.payments as PaymentLineInput[] | undefined;
  if (subtotal > 0 && (!Array.isArray(paymentsRaw) || paymentsRaw.length === 0)) {
    res.status(400).json({ error: "Informe as formas de pagamento." });
    return;
  }

  const cashId = await getOpenCashRegisterId();
  if (!cashId) {
    res.status(409).json({ error: "Não há caixa aberto." });
    return;
  }

  if (subtotal <= 0) {
    const closed = await prisma.$transaction(async (tx) => {
      await decrementStockTx(tx, orderId);
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "CLOSED",
          closedAt: new Date(),
          closedCashRegisterId: cashId,
        },
        include: orderIncludeWithPayments,
      });
    });
    res.json({ order: serializeOrder(closed) });
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

  if (Math.abs(sumPaid - subtotal) > 0.02) {
    res.status(400).json({
      error: `Total pago (${sumPaid.toFixed(2)}) deve ser igual ao pedido (${subtotal.toFixed(2)}).`,
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
        },
        include: orderIncludeWithPayments,
      });
    });
    res.json({ order: serializeOrder(closed) });
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
        },
        include: orderInclude,
      });
    });
    res.json({ order: serializeOrder(updated) });
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
    res.json({ order: full ? serializeOrder(full) : null });
    return;
  }

  if (order.status === "CLOSED") {
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.orderPayment.deleteMany({ where: { orderId } });
        if (restoreStock) {
          await incrementStockTx(tx, orderId);
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
      res.json({ order: serializeOrder(updated) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cancelar.";
      res.status(400).json({ error: msg });
    }
    return;
  }

  res.status(409).json({ error: "Estado do pedido não permite cancelamento." });
});
