import { Router } from "express";
import type { OrderKind, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  requireClientsAccess,
  requireClientsCadastrar,
  requireClientsEditar,
  requireCustomerOrdersReport,
} from "../middleware/customersAccess.js";

export const customersRouter = Router();

customersRouter.use(authMiddleware);

const orderIncludeReport = {
  createdBy: { select: { id: true, name: true, login: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    include: {
      product: { select: { name: true } },
    },
    orderBy: { id: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

function serializeOrderRow(order: {
  id: string;
  kind: OrderKind;
  clientName: string | null;
  status: OrderStatus;
  openedAt: Date;
  closedAt: Date | null;
  customer: { id: string; name: string; phone: string | null } | null;
  createdBy: { id: string; name: string; login: string };
  items: { quantity: number; unitPrice: number; product: { name: string } }[];
}) {
  const subtotal =
    Math.round(order.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) * 100) / 100;
  return {
    id: order.id,
    kind: order.kind,
    clientName: order.clientName,
    customer: order.customer,
    status: order.status,
    openedAt: order.openedAt.toISOString(),
    closedAt: order.closedAt?.toISOString() ?? null,
    subtotal,
    createdBy: order.createdBy,
  };
}

customersRouter.get("/", requireClientsAccess, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const where: Prisma.CustomerWhereInput = { active: true };
  if (q) {
    where.OR = [{ name: { contains: q } }, { phone: { contains: q } }, { document: { contains: q } }];
  }
  const rows = await prisma.customer.findMany({
    where,
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      phone: true,
      document: true,
      email: true,
      notes: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({
    customers: rows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
});

customersRouter.post("/", requireClientsCadastrar, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 200) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return;
  }
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() || null : null;
  const document = typeof req.body?.document === "string" ? req.body.document.trim() || null : null;
  const email = typeof req.body?.email === "string" ? req.body.email.trim() || null : null;
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null;

  const created = await prisma.customer.create({
    data: { name, phone, document, email, notes },
  });

  res.status(201).json({
    customer: {
      ...created,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  });
});

/** Comandas do cliente — antes de `/:id` para não capturar "orders". */
customersRouter.get("/:id/orders", requireCustomerOrdersReport, async (req, res) => {
  const customerId = req.params.id;

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }

  const status = (req.query.status as OrderStatus | undefined) ?? "CLOSED";
  if (!["OPEN", "CLOSED", "CANCELLED"].includes(status)) {
    res.status(400).json({ error: "Status inválido." });
    return;
  }

  const kind = (req.query.kind as OrderKind | undefined) ?? "COMANDA";

  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  let from: Date;
  let to: Date;
  if (fromRaw && toRaw) {
    from = new Date(fromRaw);
    to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      res.status(400).json({ error: "Datas inválidas (use ISO, ex.: 2026-04-01)." });
      return;
    }
    to.setHours(23, 59, 59, 999);
  } else {
    to = new Date();
    from = new Date();
    from.setDate(from.getDate() - 90);
    from.setHours(0, 0, 0, 0);
  }

  const where: Prisma.OrderWhereInput = {
    customerId,
    kind,
    status,
  };
  if (status === "OPEN") {
    where.openedAt = { gte: from, lte: to };
  } else {
    where.closedAt = { gte: from, lte: to };
  }

  const rows = await prisma.order.findMany({
    where,
    orderBy: status === "OPEN" ? { openedAt: "desc" } : { closedAt: "desc" },
    take: 500,
    include: orderIncludeReport,
  });

  const orders = rows.map((o) => ({
    ...serializeOrderRow(o),
    items: o.items.map((i) => ({
      productName: i.product.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: Math.round(i.quantity * i.unitPrice * 100) / 100,
    })),
  }));

  const total = Math.round(orders.reduce((s, o) => s + o.subtotal, 0) * 100) / 100;

  res.json({
    customer: { id: customer.id, name: customer.name },
    filter: {
      from: from.toISOString(),
      to: to.toISOString(),
      status,
      kind,
    },
    orders,
    total,
  });
});

customersRouter.get("/:id", requireClientsAccess, async (req, res) => {
  const row = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }
  res.json({
    customer: {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
});

customersRouter.patch("/:id", requireClientsEditar, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Cliente não encontrado." });
    return;
  }

  const data: Prisma.CustomerUpdateInput = {};
  if (typeof req.body?.name === "string") {
    const name = req.body.name.trim();
    if (!name) {
      res.status(400).json({ error: "Nome inválido." });
      return;
    }
    data.name = name;
  }
  if (req.body?.phone !== undefined) {
    data.phone = typeof req.body.phone === "string" ? req.body.phone.trim() || null : null;
  }
  if (req.body?.document !== undefined) {
    data.document = typeof req.body.document === "string" ? req.body.document.trim() || null : null;
  }
  if (req.body?.email !== undefined) {
    data.email = typeof req.body.email === "string" ? req.body.email.trim() || null : null;
  }
  if (req.body?.notes !== undefined) {
    data.notes = typeof req.body.notes === "string" ? req.body.notes.trim() || null : null;
  }
  if (req.body?.active !== undefined) {
    data.active = Boolean(req.body.active);
  }

  const updated = await prisma.customer.update({ where: { id }, data });
  res.json({
    customer: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});
