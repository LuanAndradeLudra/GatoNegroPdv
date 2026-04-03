import { Router } from "express";
import type { PaymentMethodKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireManageSettings } from "../middleware/requireManageSettings.js";

export const paymentMethodsRouter = Router();

paymentMethodsRouter.use(authMiddleware);

const KINDS: PaymentMethodKind[] = ["DINHEIRO", "DEBITO", "CREDITO", "VALE"];

function parseKind(raw: unknown): PaymentMethodKind | undefined {
  return typeof raw === "string" && KINDS.includes(raw as PaymentMethodKind) ? (raw as PaymentMethodKind) : undefined;
}

paymentMethodsRouter.get("/", async (req, res) => {
  const all = req.query.all === "1" || req.query.all === "true";
  const rows = await prisma.paymentMethod.findMany({
    where: all ? {} : { active: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  res.json({
    methods: rows.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      feePercent: m.feePercent,
      active: m.active,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
  });
});

paymentMethodsRouter.post("/", requireManageSettings, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 120) {
    res.status(400).json({ error: "Informe um nome válido (até 120 caracteres)." });
    return;
  }
  const kind = parseKind(req.body?.kind);
  if (!kind) {
    res.status(400).json({ error: "Tipo inválido. Use: DINHEIRO, DEBITO, CREDITO ou VALE." });
    return;
  }
  let feePercent: number | null = null;
  const rawFee = req.body?.feePercent;
  if (rawFee !== undefined && rawFee !== null && rawFee !== "") {
    const n = typeof rawFee === "number" ? rawFee : Number.parseFloat(String(rawFee).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      res.status(400).json({ error: "Taxa % deve estar entre 0 e 100." });
      return;
    }
    feePercent = Math.round(n * 1000) / 1000;
  }

  const created = await prisma.paymentMethod.create({
    data: { name, kind, feePercent },
  });
  res.status(201).json({
    method: {
      id: created.id,
      name: created.name,
      kind: created.kind,
      feePercent: created.feePercent,
      active: created.active,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  });
});

paymentMethodsRouter.patch("/:id", requireManageSettings, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Forma de pagamento não encontrada." });
    return;
  }

  const data: { name?: string; kind?: PaymentMethodKind; feePercent?: number | null; active?: boolean } = {};

  if (req.body?.name !== undefined) {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 120) {
      res.status(400).json({ error: "Nome inválido." });
      return;
    }
    data.name = name;
  }

  if (req.body?.kind !== undefined) {
    const kind = parseKind(req.body.kind);
    if (!kind) {
      res.status(400).json({ error: "Tipo inválido." });
      return;
    }
    data.kind = kind;
  }

  if (req.body?.feePercent !== undefined) {
    const rawFee = req.body.feePercent;
    if (rawFee === null || rawFee === "") {
      data.feePercent = null;
    } else {
      const n = typeof rawFee === "number" ? rawFee : Number.parseFloat(String(rawFee).replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        res.status(400).json({ error: "Taxa % inválida." });
        return;
      }
      data.feePercent = Math.round(n * 1000) / 1000;
    }
  }

  if (req.body?.active !== undefined) {
    data.active = Boolean(req.body.active);
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  const updated = await prisma.paymentMethod.update({
    where: { id },
    data,
  });
  res.json({
    method: {
      id: updated.id,
      name: updated.name,
      kind: updated.kind,
      feePercent: updated.feePercent,
      active: updated.active,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

paymentMethodsRouter.delete("/:id", requireManageSettings, async (req, res) => {
  const id = req.params.id;
  const existing = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Forma de pagamento não encontrada." });
    return;
  }
  await prisma.paymentMethod.update({
    where: { id },
    data: { active: false },
  });
  res.status(204).send();
});
