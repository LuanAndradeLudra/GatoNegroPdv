import { Router } from "express";
import type { OrderKind, OrderStatus, Prisma } from "@prisma/client";
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
  items: {
    include: {
      product: { select: { name: true, isKitchenItem: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

function serializeOrder(order: {
  id: string;
  kind: OrderKind;
  clientName: string | null;
  status: OrderStatus;
  openedAt: Date;
  closedAt: Date | null;
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
}) {
  const items = order.items.map((i) => {
    const lineTotal = Math.round(i.quantity * i.unitPrice * 100) / 100;
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
  const subtotal = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;
  return {
    id: order.id,
    kind: order.kind,
    clientName: order.clientName,
    status: order.status,
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    createdBy: order.createdBy,
    items,
    subtotal,
  };
}

pdvRouter.get("/orders", async (req, res) => {
  const status = req.query.status as OrderStatus | undefined;
  const kind = req.query.kind as OrderKind | undefined;
  const where: Prisma.OrderWhereInput = {};
  if (status && ["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
    where.status = status;
  }
  if (kind && ["DIRECT", "COMANDA"].includes(kind)) {
    where.kind = kind;
  }
  const rows = await prisma.order.findMany({
    where,
    orderBy: { openedAt: "desc" },
    take: 100,
    include: orderInclude,
  });
  res.json({ orders: rows.map(serializeOrder) });
});

pdvRouter.get("/orders/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: orderInclude,
  });
  if (!order) {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  res.json({ order: serializeOrder(order) });
});

pdvRouter.post("/orders", requireOpenCashRegister, async (req, res) => {
  const kind = req.body?.kind as OrderKind | undefined;
  if (kind !== "DIRECT" && kind !== "COMANDA") {
    res.status(400).json({ error: "Informe o tipo: DIRECT ou COMANDA." });
    return;
  }
  const clientName =
    typeof req.body?.clientName === "string" ? req.body.clientName.trim() || null : null;

  const created = await prisma.order.create({
    data: {
      kind,
      clientName,
      createdById: req.user!.sub,
    },
    include: orderInclude,
  });

  res.status(201).json({ order: serializeOrder(created) });
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

  const full = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  res.json({ order: full ? serializeOrder(full) : null });
});

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

  const closed = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
    },
    include: orderInclude,
  });

  res.json({ order: serializeOrder(closed) });
});
