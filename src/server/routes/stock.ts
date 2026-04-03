import { Router } from "express";
import type { Prisma, StockMovementKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  attachStockAccess,
  requireStockListAccess,
  requireStockProdutos,
} from "../middleware/stockAccess.js";

export const stockRouter = Router();
stockRouter.use(authMiddleware);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const productSelectErp = {
  id: true,
  name: true,
  price: true,
  stock: true,
  isKitchenItem: true,
  controlsStock: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeMovement(m: {
  id: string;
  kind: StockMovementKind;
  balanceBefore: number;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
  product: { id: string; name: string };
  createdBy: { id: string; name: string };
}) {
  return {
    id: m.id,
    kind: m.kind,
    balanceBefore: m.balanceBefore,
    balanceAfter: m.balanceAfter,
    delta: round2(m.balanceAfter - m.balanceBefore),
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    product: m.product,
    createdBy: m.createdBy,
  };
}

stockRouter.get("/products", requireStockListAccess, async (_req, res) => {
  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: productSelectErp,
  });
  res.json({ products: rows });
});

stockRouter.post("/products", requireStockProdutos, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const price = Number(req.body?.price);
  const isKitchenItem = Boolean(req.body?.isKitchenItem);
  const controlsStock = req.body?.controlsStock !== false;
  const active = req.body?.active !== false;
  const initialRaw = req.body?.initialStock;
  const initialStock =
    typeof initialRaw === "number"
      ? initialRaw
      : typeof initialRaw === "string"
        ? Number.parseFloat(initialRaw.replace(",", "."))
        : 0;

  if (!name || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Nome e preço válidos são obrigatórios." });
    return;
  }
  if (!Number.isFinite(initialStock) || initialStock < 0) {
    res.status(400).json({ error: "Estoque inicial inválido." });
    return;
  }

  const userId = req.user!.sub;
  const initial = round2(initialStock);

  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name,
        price: round2(price),
        stock: controlsStock ? initial : 0,
        isKitchenItem,
        controlsStock,
        active,
      },
      select: productSelectErp,
    });

    if (controlsStock && initial > 0.0001) {
      await tx.stockMovement.create({
        data: {
          productId: p.id,
          kind: "ENTRADA",
          balanceBefore: 0,
          balanceAfter: initial,
          note: "Estoque inicial no cadastro",
          createdById: userId,
        },
      });
    }

    return p;
  });

  res.status(201).json({ product: created });
});

stockRouter.patch("/products/:id", requireStockProdutos, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  const data: Prisma.ProductUpdateInput = {};

  if (typeof req.body?.name === "string") {
    const n = req.body.name.trim();
    if (n) {
      data.name = n;
    }
  }
  if (req.body?.price !== undefined) {
    const price = Number(req.body.price);
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: "Preço inválido." });
      return;
    }
    data.price = round2(price);
  }
  if (req.body?.isKitchenItem !== undefined) {
    data.isKitchenItem = Boolean(req.body.isKitchenItem);
  }
  if (req.body?.controlsStock !== undefined) {
    data.controlsStock = Boolean(req.body.controlsStock);
  }
  if (req.body?.active !== undefined) {
    data.active = Boolean(req.body.active);
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  const updated = await prisma.product.update({
    where: { id },
    data,
    select: productSelectErp,
  });
  res.json({ product: updated });
});

stockRouter.delete("/products/:id", requireStockProdutos, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Produto não encontrado." });
    return;
  }

  const usage = await prisma.orderItem.count({ where: { productId: id } });
  if (usage > 0) {
    res.status(409).json({
      error: "Este produto já foi usado em vendas. Desative-o no cadastro em vez de excluir.",
    });
    return;
  }

  await prisma.product.delete({ where: { id } });
  res.status(204).send();
});

stockRouter.get("/movements", requireStockListAccess, async (req, res) => {
  const productId = typeof req.query.productId === "string" ? req.query.productId.trim() : "";
  const takeRaw = req.query.take;
  const take = Math.min(200, Math.max(1, Number(takeRaw) || 80));

  const rows = await prisma.stockMovement.findMany({
    where: productId ? { productId } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      product: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  res.json({ movements: rows.map(serializeMovement) });
});

stockRouter.post("/movements", attachStockAccess, async (req, res) => {
  const flags = req.stockAccess!;
  const kind = req.body?.kind as StockMovementKind | undefined;
  const productId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
  const note = typeof req.body?.note === "string" ? req.body.note.trim() || null : null;

  if (kind !== "ENTRADA" && kind !== "SAIDA" && kind !== "AJUSTE") {
    res.status(400).json({ error: "Informe o tipo: ENTRADA, SAIDA ou AJUSTE." });
    return;
  }
  if (!productId) {
    res.status(400).json({ error: "Produto obrigatório." });
    return;
  }

  if (kind === "ENTRADA" && !flags.entrada) {
    res.status(403).json({ error: "Sem permissão para entrada de mercadoria." });
    return;
  }
  if (kind === "SAIDA" && !flags.saida) {
    res.status(403).json({ error: "Sem permissão para saída de estoque." });
    return;
  }
  if (kind === "AJUSTE" && !flags.ajuste) {
    res.status(403).json({ error: "Sem permissão para ajuste de inventário." });
    return;
  }

  const qtyRaw = req.body?.quantity;
  const quantity =
    typeof qtyRaw === "number"
      ? qtyRaw
      : typeof qtyRaw === "string"
        ? Number.parseFloat(qtyRaw.replace(",", "."))
        : NaN;
  const newStockRaw = req.body?.newStock;
  const newStockAbs =
    typeof newStockRaw === "number"
      ? newStockRaw
      : typeof newStockRaw === "string"
        ? Number.parseFloat(newStockRaw.replace(",", "."))
        : NaN;

  const userId = req.user!.sub;

  try {
    const movement = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) {
        throw new Error("NOT_FOUND");
      }
      if (!product.controlsStock) {
        throw new Error("NO_STOCK_CTRL");
      }

      const before = round2(product.stock);
      let after: number;

      if (kind === "ENTRADA") {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("BAD_QTY");
        }
        after = round2(before + round2(quantity));
      } else if (kind === "SAIDA") {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("BAD_QTY");
        }
        after = round2(before - round2(quantity));
        if (after < -0.0001) {
          throw new Error("INSUFFICIENT");
        }
      } else {
        if (!Number.isFinite(newStockAbs) || newStockAbs < 0) {
          throw new Error("BAD_NEW");
        }
        after = round2(newStockAbs);
      }

      await tx.product.update({
        where: { id: productId },
        data: { stock: after },
      });

      const row = await tx.stockMovement.create({
        data: {
          productId,
          kind,
          balanceBefore: before,
          balanceAfter: after,
          note,
          createdById: userId,
        },
        include: {
          product: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
        },
      });

      return row;
    });

    res.status(201).json({ movement: serializeMovement(movement) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ error: "Produto não encontrado." });
      return;
    }
    if (msg === "NO_STOCK_CTRL") {
      res.status(400).json({ error: "Este produto não controla estoque. Ative o controle no cadastro." });
      return;
    }
    if (msg === "BAD_QTY") {
      res.status(400).json({ error: "Informe uma quantidade válida (> 0)." });
      return;
    }
    if (msg === "INSUFFICIENT") {
      res.status(409).json({ error: "Estoque insuficiente para esta saída." });
      return;
    }
    if (msg === "BAD_NEW") {
      res.status(400).json({ error: "Informe o novo saldo (≥ 0) para ajuste." });
      return;
    }
    throw e;
  }
});
