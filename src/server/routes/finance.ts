import type { OrderKind, OrderStatus, PaymentMethodKind, Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireFinanceiro } from "../middleware/financeAccess.js";

export const financeRouter = Router();
financeRouter.use(authMiddleware);
financeRouter.use(requireFinanceiro);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** YYYY-MM-DD (somente data) — limites do dia no fuso America/Sao_Paulo (evita new Date("yyyy-mm-dd") = UTC meia-noite). */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function todayYmdSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00-03:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseRange(req: { query: Record<string, unknown> }): { from: Date; to: Date } {
  const fromRaw = typeof req.query.from === "string" ? req.query.from.trim() : "";
  const toRaw = typeof req.query.to === "string" ? req.query.to.trim() : "";
  if (fromRaw && toRaw && DATE_ONLY.test(fromRaw) && DATE_ONLY.test(toRaw)) {
    let start = new Date(`${fromRaw}T00:00:00-03:00`);
    let end = new Date(`${toRaw}T23:59:59.999-03:00`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start > end) {
        start = new Date(`${toRaw}T00:00:00-03:00`);
        end = new Date(`${fromRaw}T23:59:59.999-03:00`);
      }
      return { from: start, to: end };
    }
  }
  const today = todayYmdSaoPaulo();
  const fromDay = addCalendarDaysYmd(today, -29);
  return {
    from: new Date(`${fromDay}T00:00:00-03:00`),
    to: new Date(`${today}T23:59:59.999-03:00`),
  };
}

const financeOrderDetailInclude = {
  createdBy: { select: { id: true, name: true, login: true } },
  closedBy: { select: { id: true, name: true, login: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    include: {
      product: { select: { name: true, isKitchenItem: true, controlsStock: true, stock: true } },
    },
    orderBy: { id: "asc" as const },
  },
  payments: {
    include: {
      paymentMethod: { select: { id: true, name: true, kind: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.OrderInclude;

function serializeFinanceClosedOrder(order: {
  id: string;
  kind: OrderKind;
  clientName: string | null;
  customerId: string | null;
  customer: { id: string; name: string; phone: string | null } | null;
  status: OrderStatus;
  openedAt: Date;
  closedAt: Date | null;
  lastActivityAt: Date | null;
  cancelledAt: Date | null;
  closedCashRegisterId: string | null;
  createdBy: { id: string; name: string; login: string };
  closedBy: { id: string; name: string; login: string } | null;
  items: {
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    kitchenStatus: string | null;
    product: { name: string; isKitchenItem: boolean; controlsStock: boolean; stock: number };
  }[];
  payments: {
    id: string;
    paymentMethodId: string;
    amountPaid: number;
    feeAmount: number;
    netAmount: number;
    cashReceived: number | null;
    paymentMethod: { id: string; name: string; kind: PaymentMethodKind };
  }[];
}) {
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
      controlsStock: i.product.controlsStock,
      stockPhysical: null as number | null,
      reservedElsewhere: null as number | null,
      maxQuantity: null as number | null,
    };
  });
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const paymentsOut = order.payments.map((p) => ({
    id: p.id,
    paymentMethodId: p.paymentMethodId,
    paymentMethodName: p.paymentMethod.name,
    paymentMethodKind: p.paymentMethod.kind,
    amountPaid: p.amountPaid,
    feeAmount: p.feeAmount,
    netAmount: p.netAmount,
    cashReceived: p.cashReceived,
  }));
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
    subtotal,
    payments: paymentsOut,
    canReopen: false,
  };
}

/** Pedido fechado (mesmo formato do PDV) para relatório no Financeiro. */
financeRouter.get("/orders/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: financeOrderDetailInclude,
  });
  if (!order || order.status !== "CLOSED") {
    res.status(404).json({ error: "Pedido não encontrado." });
    return;
  }
  res.json({ order: serializeFinanceClosedOrder(order) });
});

/** Turnos de caixa fechados no período + totais (sangria, suprimento, vendas líquidas). */
financeRouter.get("/cash-flow", async (req, res) => {
  const { from, to } = parseRange(req);

  const sessions = await prisma.cashRegister.findMany({
    where: {
      closedAt: { not: null, gte: from, lte: to },
    },
    orderBy: { closedAt: "desc" },
    include: {
      openedBy: { select: { id: true, name: true, login: true } },
      closedBy: { select: { id: true, name: true, login: true } },
    },
  });

  const rows = await Promise.all(
    sessions.map(async (s) => {
      const [sangria, suprimento, payAgg, cashSalesAgg] = await Promise.all([
        prisma.cashMovement.aggregate({
          where: { cashRegisterId: s.id, type: "SANGRIA" },
          _sum: { amount: true },
        }),
        prisma.cashMovement.aggregate({
          where: { cashRegisterId: s.id, type: "SUPRIMENTO" },
          _sum: { amount: true },
        }),
        prisma.orderPayment.aggregate({
          where: {
            order: {
              closedCashRegisterId: s.id,
              status: "CLOSED",
            },
          },
          _sum: { netAmount: true, amountPaid: true, feeAmount: true },
        }),
        prisma.orderPayment.aggregate({
          where: {
            order: {
              closedCashRegisterId: s.id,
              status: "CLOSED",
            },
            paymentMethod: { kind: "DINHEIRO" },
          },
          _sum: { amountPaid: true },
        }),
      ]);

      const totalSangria = round2(sangria._sum.amount ?? 0);
      const totalSuprimento = round2(suprimento._sum.amount ?? 0);
      const salesNet = round2(payAgg._sum.netAmount ?? 0);
      const salesGross = round2(payAgg._sum.amountPaid ?? 0);
      const fees = round2(payAgg._sum.feeAmount ?? 0);
      const cashSalesGross = round2(cashSalesAgg._sum.amountPaid ?? 0);
      /** Dinheiro esperado na gaveta: fundo + suprimentos − sangrias + vendas em dinheiro (bruto). */
      const expectedDrawerCash = round2(s.initialValue + totalSuprimento - totalSangria + cashSalesGross);
      const closingBalance = s.closingBalance != null ? round2(s.closingBalance) : null;
      const closingVariance =
        closingBalance != null ? round2(closingBalance - expectedDrawerCash) : null;

      return {
        sessionId: s.id,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt!.toISOString(),
        shift: s.shift,
        shiftCustomLabel: s.shiftCustomLabel,
        initialValue: round2(s.initialValue),
        totalSangria,
        totalSuprimento,
        salesNet,
        salesGross,
        fees,
        cashSalesGross,
        expectedDrawerCash,
        closingBalance,
        closingVariance,
        openedBy: s.openedBy,
        closedBy: s.closedBy,
      };
    }),
  );

  res.json({
    filter: { from: from.toISOString(), to: to.toISOString() },
    sessions: rows,
  });
});

/** Resumo de vendas no período (pedidos fechados) + lista analítica. */
financeRouter.get("/sales-summary", async (req, res) => {
  const { from, to } = parseRange(req);

  const closedWhere = {
    status: "CLOSED" as const,
    closedAt: { gte: from, lte: to },
  };

  const totalClosedOrdersInPeriod = await prisma.order.count({ where: closedWhere });

  const orderRows = await prisma.order.findMany({
    where: closedWhere,
    orderBy: { closedAt: "desc" },
    take: 2000,
    select: {
      id: true,
      kind: true,
      closedAt: true,
      clientName: true,
      customer: { select: { name: true } },
      payments: {
        select: {
          netAmount: true,
          amountPaid: true,
          feeAmount: true,
          paymentMethodId: true,
          paymentMethod: { select: { id: true, name: true, kind: true } },
        },
      },
    },
  });

  const groupedItems = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: closedWhere,
    },
    _sum: { quantity: true },
  });
  const sortedTop = groupedItems
    .map((g) => ({
      productId: g.productId,
      quantitySold: round2(g._sum.quantity ?? 0),
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 5);
  let topProducts: { productId: string; name: string; quantitySold: number }[] = [];
  if (sortedTop.length > 0) {
    const ids = sortedTop.map((r) => r.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));
    topProducts = sortedTop.map((r) => ({
      productId: r.productId,
      name: nameById.get(r.productId) ?? "—",
      quantitySold: r.quantitySold,
    }));
  }

  if (totalClosedOrdersInPeriod === 0) {
    res.json({
      filter: { from: from.toISOString(), to: to.toISOString() },
      orderCount: 0,
      totalClosedOrdersInPeriod: 0,
      ordersTruncated: false,
      totalNet: 0,
      totalGross: 0,
      totalFees: 0,
      byKind: { DIRECT: 0, COMANDA: 0 },
      byPaymentMethod: [],
      orders: [],
      averageTicket: 0,
      topProducts,
    });
    return;
  }

  const [totalsAll, directAgg, comandaAgg, methodGroups] = await Promise.all([
    prisma.orderPayment.aggregate({
      where: { order: closedWhere },
      _sum: { netAmount: true, amountPaid: true, feeAmount: true },
    }),
    prisma.orderPayment.aggregate({
      where: { order: { ...closedWhere, kind: "DIRECT" } },
      _sum: { netAmount: true },
    }),
    prisma.orderPayment.aggregate({
      where: { order: { ...closedWhere, kind: "COMANDA" } },
      _sum: { netAmount: true },
    }),
    prisma.orderPayment.groupBy({
      by: ["paymentMethodId"],
      where: { order: closedWhere },
      _sum: { netAmount: true, amountPaid: true, feeAmount: true },
    }),
  ]);

  const totalNet = round2(totalsAll._sum.netAmount ?? 0);
  const totalGross = round2(totalsAll._sum.amountPaid ?? 0);
  const totalFees = round2(totalsAll._sum.feeAmount ?? 0);
  const directNet = round2(directAgg._sum.netAmount ?? 0);
  const comandaNet = round2(comandaAgg._sum.netAmount ?? 0);

  const pmIds = methodGroups.map((g) => g.paymentMethodId);
  const paymentMethods =
    pmIds.length > 0
      ? await prisma.paymentMethod.findMany({
          where: { id: { in: pmIds } },
          select: { id: true, name: true, kind: true },
        })
      : [];
  const pmMap = new Map(paymentMethods.map((m) => [m.id, m]));
  const byPaymentMethod = methodGroups
    .map((g) => {
      const pm = pmMap.get(g.paymentMethodId);
      return {
        paymentMethodId: g.paymentMethodId,
        name: pm?.name ?? "—",
        kind: pm?.kind ?? "",
        net: round2(g._sum.netAmount ?? 0),
        gross: round2(g._sum.amountPaid ?? 0),
        fee: round2(g._sum.feeAmount ?? 0),
      };
    })
    .sort((a, b) => b.net - a.net);

  const ordersOut: {
    orderId: string;
    closedAt: string;
    kind: OrderKind;
    clientLabel: string;
    totalNet: number;
    totalGross: number;
    totalFees: number;
  }[] = [];

  for (const o of orderRows) {
    let oNet = 0;
    let oGross = 0;
    let oFee = 0;
    for (const p of o.payments) {
      oNet += round2(p.netAmount);
      oGross += round2(p.amountPaid);
      oFee += round2(p.feeAmount);
    }
    const cust = o.customer?.name?.trim();
    const cli = o.clientName?.trim();
    const clientLabel = cust || cli || "—";
    ordersOut.push({
      orderId: o.id,
      closedAt: o.closedAt!.toISOString(),
      kind: o.kind,
      clientLabel,
      totalNet: round2(oNet),
      totalGross: round2(oGross),
      totalFees: round2(oFee),
    });
  }

  const ordersTruncated = totalClosedOrdersInPeriod > 2000;
  const averageTicket =
    totalClosedOrdersInPeriod > 0 ? round2(totalNet / totalClosedOrdersInPeriod) : 0;

  res.json({
    filter: { from: from.toISOString(), to: to.toISOString() },
    orderCount: orderRows.length,
    totalClosedOrdersInPeriod,
    ordersTruncated,
    totalNet,
    totalGross,
    totalFees,
    byKind: { DIRECT: directNet, COMANDA: comandaNet },
    byPaymentMethod,
    orders: ordersOut,
    averageTicket,
    topProducts,
  });
});
