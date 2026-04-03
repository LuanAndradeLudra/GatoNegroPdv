import { Router } from "express";
import type { Prisma, StockMovementKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { notifyStockChanged } from "../lib/stockBroadcast.js";
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
  minStock: true,
  averageCost: true,
  isKitchenItem: true,
  controlsStock: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} as const;

type ProductErpRow = Prisma.ProductGetPayload<{ select: typeof productSelectErp }>;

function serializeProduct(p: ProductErpRow) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    stock: p.stock,
    minStock: p.minStock,
    averageCost: p.averageCost,
    isKitchenItem: p.isKitchenItem,
    controlsStock: p.controlsStock,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
  };
}

function serializeMovement(m: {
  id: string;
  kind: StockMovementKind;
  balanceBefore: number;
  balanceAfter: number;
  unitCost: number | null;
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
    unitCost: m.unitCost,
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    product: m.product,
    createdBy: m.createdBy,
  };
}

stockRouter.get("/categories", requireStockListAccess, async (_req, res) => {
  const rows = await prisma.productCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  res.json({
    categories: rows.map((c) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
});

stockRouter.post("/categories", requireStockProdutos, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 120) {
    res.status(400).json({ error: "Informe um nome válido." });
    return;
  }
  const sortOrder =
    typeof req.body?.sortOrder === "number" && Number.isFinite(req.body.sortOrder)
      ? Math.round(req.body.sortOrder)
      : 0;
  const created = await prisma.productCategory.create({
    data: { name, sortOrder },
  });
  res.status(201).json({
    category: {
      id: created.id,
      name: created.name,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  });
});

stockRouter.patch("/categories/:id", requireStockProdutos, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  const data: Prisma.ProductCategoryUpdateInput = {};
  if (typeof req.body?.name === "string") {
    const n = req.body.name.trim();
    if (n) {
      data.name = n;
    }
  }
  if (req.body?.sortOrder !== undefined && typeof req.body.sortOrder === "number") {
    data.sortOrder = Math.round(req.body.sortOrder);
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }
  const updated = await prisma.productCategory.update({ where: { id }, data });
  res.json({
    category: {
      id: updated.id,
      name: updated.name,
      sortOrder: updated.sortOrder,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

stockRouter.delete("/categories/:id", requireStockProdutos, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Categoria não encontrada." });
    return;
  }
  await prisma.product.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await prisma.productCategory.delete({ where: { id } });
  res.status(204).send();
});

stockRouter.get("/products", requireStockListAccess, async (_req, res) => {
  const rows = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: productSelectErp,
  });
  res.json({ products: rows.map(serializeProduct) });
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

  const minRaw = req.body?.minStock;
  const minStock =
    typeof minRaw === "number"
      ? minRaw
      : typeof minRaw === "string"
        ? Number.parseFloat(minRaw.replace(",", "."))
        : 0;

  const catRaw = req.body?.categoryId;
  let categoryId: string | null = null;
  if (typeof catRaw === "string" && catRaw.trim()) {
    const c = await prisma.productCategory.findUnique({ where: { id: catRaw.trim() } });
    if (!c) {
      res.status(400).json({ error: "Categoria não encontrada." });
      return;
    }
    categoryId = c.id;
  }

  if (!name || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Nome e preço válidos são obrigatórios." });
    return;
  }
  if (!Number.isFinite(initialStock) || initialStock < 0) {
    res.status(400).json({ error: "Estoque inicial inválido." });
    return;
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    res.status(400).json({ error: "Estoque mínimo inválido." });
    return;
  }

  let initialAverageCost: number | undefined;
  const avgRaw = req.body?.averageCost;
  if (avgRaw !== undefined && avgRaw !== null && avgRaw !== "") {
    const ac =
      typeof avgRaw === "number"
        ? avgRaw
        : Number.parseFloat(String(avgRaw).replace(",", "."));
    if (!Number.isFinite(ac) || ac < 0) {
      res.status(400).json({ error: "Custo médio inválido." });
      return;
    }
    initialAverageCost = round2(ac);
  }

  const userId = req.user!.sub;
  const initial = round2(initialStock);

  const created = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name,
        price: round2(price),
        stock: controlsStock ? initial : 0,
        minStock: round2(minStock),
        isKitchenItem,
        controlsStock,
        active,
        categoryId,
        ...(initialAverageCost !== undefined ? { averageCost: initialAverageCost } : {}),
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
          ...(initialAverageCost !== undefined ? { unitCost: initialAverageCost } : {}),
        },
      });
    }

    return p;
  });

  notifyStockChanged();
  res.status(201).json({ product: serializeProduct(created) });
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
  if (req.body?.minStock !== undefined) {
    const minRaw = req.body.minStock;
    const minStock =
      typeof minRaw === "number"
        ? minRaw
        : typeof minRaw === "string"
          ? Number.parseFloat(String(minRaw).replace(",", "."))
          : NaN;
    if (!Number.isFinite(minStock) || minStock < 0) {
      res.status(400).json({ error: "Estoque mínimo inválido." });
      return;
    }
    data.minStock = round2(minStock);
  }
  if (req.body?.categoryId !== undefined) {
    const catRaw = req.body.categoryId;
    if (catRaw === null || catRaw === "") {
      data.category = { disconnect: true };
    } else if (typeof catRaw === "string") {
      const c = await prisma.productCategory.findUnique({ where: { id: catRaw.trim() } });
      if (!c) {
        res.status(400).json({ error: "Categoria não encontrada." });
        return;
      }
      data.category = { connect: { id: c.id } };
    }
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
  if (req.body?.averageCost !== undefined) {
    const raw = req.body.averageCost;
    if (raw === null || raw === "") {
      data.averageCost = null;
    } else {
      const ac =
        typeof raw === "number"
          ? raw
          : Number.parseFloat(String(raw).replace(",", "."));
      if (!Number.isFinite(ac) || ac < 0) {
        res.status(400).json({ error: "Custo médio inválido." });
        return;
      }
      data.averageCost = round2(ac);
    }
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
  notifyStockChanged();
  res.json({ product: serializeProduct(updated) });
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
  notifyStockChanged();
  res.status(204).send();
});

stockRouter.get("/movements", requireStockListAccess, async (req, res) => {
  const productId = typeof req.query.productId === "string" ? req.query.productId.trim() : "";
  const kindQ = typeof req.query.kind === "string" ? req.query.kind.trim().toUpperCase() : "";
  const takeRaw = req.query.take;
  const take = Math.min(200, Math.max(1, Number(takeRaw) || 80));

  const where: Prisma.StockMovementWhereInput = {};
  if (productId) {
    where.productId = productId;
  }
  if (kindQ === "ENTRADA" || kindQ === "SAIDA" || kindQ === "AJUSTE") {
    where.kind = kindQ as StockMovementKind;
  }

  const rows = await prisma.stockMovement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      product: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  res.json({ movements: rows.map(serializeMovement) });
});

stockRouter.post("/inventory-close", attachStockAccess, async (req, res) => {
  if (!req.stockAccess!.ajuste) {
    res.status(403).json({ error: "Sem permissão para inventário (ajuste)." });
    return;
  }
  const raw = req.body?.counts;
  if (!Array.isArray(raw) || raw.length === 0) {
    res.status(400).json({ error: "Informe counts: [{ productId, counted }]." });
    return;
  }

  const lines: { productId: string; counted: number }[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const productId = typeof (row as { productId?: string }).productId === "string" ? (row as { productId: string }).productId.trim() : "";
    const countedRaw = (row as { counted?: unknown }).counted;
    const counted =
      typeof countedRaw === "number"
        ? countedRaw
        : typeof countedRaw === "string"
          ? Number.parseFloat(countedRaw.replace(",", "."))
          : NaN;
    if (!productId || !Number.isFinite(counted) || counted < 0) {
      res.status(400).json({ error: "Cada linha precisa de productId e counted (≥ 0)." });
      return;
    }
    lines.push({ productId, counted: round2(counted) });
  }

  const userId = req.user!.sub;

  try {
    await prisma.$transaction(async (tx) => {
      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product) {
          throw new Error(`NOT_FOUND:${line.productId}`);
        }
        if (!product.controlsStock) {
          continue;
        }
        const before = round2(product.stock);
        const after = line.counted;
        if (Math.abs(after - before) < 0.0001) {
          continue;
        }
        await tx.product.update({
          where: { id: line.productId },
          data: { stock: after },
        });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            kind: "AJUSTE",
            balanceBefore: before,
            balanceAfter: after,
            note: "Inventário de fechamento",
            createdById: userId,
          },
        });
      }
    });
    notifyStockChanged();
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("NOT_FOUND:")) {
      res.status(404).json({ error: "Produto não encontrado." });
      return;
    }
    throw e;
  }
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

  const unitCostRaw = req.body?.unitCost;
  let unitCost: number | undefined;
  if (unitCostRaw !== undefined && unitCostRaw !== null && unitCostRaw !== "") {
    const u =
      typeof unitCostRaw === "number"
        ? unitCostRaw
        : typeof unitCostRaw === "string"
          ? Number.parseFloat(unitCostRaw.replace(",", "."))
          : NaN;
    if (!Number.isFinite(u) || u < 0) {
      res.status(400).json({ error: "Preço de custo unitário inválido." });
      return;
    }
    unitCost = round2(u);
  }

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
      let avgUpdate: number | undefined;

      if (kind === "ENTRADA") {
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("BAD_QTY");
        }
        const q = round2(quantity);
        after = round2(before + q);
        if (unitCost !== undefined) {
          if (before <= 0.0001) {
            avgUpdate = unitCost;
          } else if (product.averageCost != null) {
            avgUpdate = round2((before * product.averageCost + q * unitCost) / after);
          } else {
            avgUpdate = unitCost;
          }
        }
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
        data: {
          stock: after,
          ...(avgUpdate !== undefined ? { averageCost: avgUpdate } : {}),
        },
      });

      const row = await tx.stockMovement.create({
        data: {
          productId,
          kind,
          balanceBefore: before,
          balanceAfter: after,
          unitCost: kind === "ENTRADA" && unitCost !== undefined ? unitCost : null,
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

    notifyStockChanged();
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
