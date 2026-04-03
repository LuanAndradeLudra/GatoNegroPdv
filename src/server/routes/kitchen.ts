import { Router } from "express";
import type { KitchenItemStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireKitchenUpdate, requireKitchenView } from "../middleware/kitchenAccess.js";

export const kitchenRouter = Router();

kitchenRouter.use(authMiddleware);

function minutesSince(start: Date): number {
  return Math.floor((Date.now() - start.getTime()) / 60_000);
}

kitchenRouter.get("/board", requireKitchenView, async (_req, res) => {
  const rows = await prisma.orderItem.findMany({
    where: {
      kitchenStatus: { not: null },
      order: { status: "OPEN" },
    },
    include: {
      order: {
        select: {
          id: true,
          kind: true,
          clientName: true,
          openedAt: true,
        },
      },
      product: { select: { name: true, isKitchenItem: true } },
    },
    orderBy: [{ order: { openedAt: "asc" } }, { id: "asc" }],
  });

  const items = rows
    .filter((r) => r.product.isKitchenItem && r.kitchenStatus != null)
    .map((r) => ({
      itemId: r.id,
      orderId: r.order.id,
      orderKind: r.order.kind,
      clientName: r.order.clientName,
      orderOpenedAt: r.order.openedAt.toISOString(),
      minutesWaiting: minutesSince(r.order.openedAt),
      productName: r.product.name,
      quantity: r.quantity,
      kitchenStatus: r.kitchenStatus as KitchenItemStatus,
    }));

  res.json({ items, serverTime: new Date().toISOString() });
});

kitchenRouter.patch("/items/:itemId/status", requireKitchenUpdate, async (req, res) => {
  const itemId = req.params.itemId;
  const nextStatus = req.body?.status as KitchenItemStatus | undefined;

  if (nextStatus !== "PREPARING" && nextStatus !== "READY") {
    res.status(400).json({ error: "Status inválido. Use PREPARING ou READY." });
    return;
  }

  const item = await prisma.orderItem.findUnique({
    where: { id: itemId },
    include: {
      order: true,
      product: { select: { isKitchenItem: true } },
    },
  });

  if (!item || !item.product.isKitchenItem || item.kitchenStatus == null) {
    res.status(404).json({ error: "Item não encontrado na cozinha." });
    return;
  }

  if (item.order.status !== "OPEN") {
    res.status(409).json({ error: "Pedido já encerrado." });
    return;
  }

  const current = item.kitchenStatus;

  if (nextStatus === "PREPARING") {
    if (current !== "PENDING" && current !== "QUEUE") {
      res.status(409).json({ error: "Só é possível preparar itens na fila." });
      return;
    }
  }

  if (nextStatus === "READY") {
    if (current !== "PREPARING") {
      res.status(409).json({ error: "Só é possível marcar como pronto o que está em preparo." });
      return;
    }
  }

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data: { kitchenStatus: nextStatus },
    include: {
      order: {
        select: {
          id: true,
          kind: true,
          clientName: true,
          openedAt: true,
        },
      },
      product: { select: { name: true, isKitchenItem: true } },
    },
  });

  res.json({
    item: {
      itemId: updated.id,
      orderId: updated.order.id,
      orderKind: updated.order.kind,
      clientName: updated.order.clientName,
      orderOpenedAt: updated.order.openedAt.toISOString(),
      minutesWaiting: minutesSince(updated.order.openedAt),
      productName: updated.product.name,
      quantity: updated.quantity,
      kitchenStatus: updated.kitchenStatus,
    },
  });
});
