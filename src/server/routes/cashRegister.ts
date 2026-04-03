import { Router } from "express";
import type { CashMovementType, CashShift, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { canAccessKitchen, canOpenPdv, resolvePermissions } from "../lib/permissions.js";
import {
  requireCashRegisterView,
  requireVendasAction,
} from "../middleware/cashAccess.js";

export const cashRegisterRouter = Router();

cashRegisterRouter.use(authMiddleware);

const selectSession = {
  id: true,
  openedAt: true,
  initialValue: true,
  closedAt: true,
  closingBalance: true,
  shift: true,
  shiftCustomLabel: true,
  openingNotes: true,
  denominationsJson: true,
  openedBy: { select: { id: true, name: true, login: true } },
  closedBy: { select: { id: true, name: true, login: true } },
} as const;

type SessionRow = {
  id: string;
  openedAt: Date;
  initialValue: number;
  closedAt: Date | null;
  closingBalance: number | null;
  shift: CashShift;
  shiftCustomLabel: string | null;
  openingNotes: string | null;
  denominationsJson: Prisma.JsonValue | null;
  openedBy: { id: string; name: string; login: string };
  closedBy: { id: string; name: string; login: string } | null;
};

function serializeSession(row: SessionRow) {
  return {
    id: row.id,
    openedAt: row.openedAt.toISOString(),
    initialValue: row.initialValue,
    closedAt: row.closedAt?.toISOString() ?? null,
    closingBalance: row.closingBalance,
    shift: row.shift,
    shiftCustomLabel: row.shiftCustomLabel,
    openingNotes: row.openingNotes,
    denominations:
      row.denominationsJson && typeof row.denominationsJson === "object"
        ? (row.denominationsJson as Record<string, number>)
        : null,
    openedBy: row.openedBy,
    closedBy: row.closedBy,
  };
}

function parseMoney(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  const n =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseFloat(raw.replace(",", ".")) : NaN;
  if (!Number.isFinite(n)) {
    return undefined;
  }
  return Math.round(n * 100) / 100;
}

const SHIFTS: CashShift[] = ["MANHA", "TARDE", "NOITE", "CUSTOM"];

function parseShift(raw: unknown): CashShift | undefined {
  if (typeof raw !== "string" || !SHIFTS.includes(raw as CashShift)) {
    return undefined;
  }
  return raw as CashShift;
}

function sumDenominations(obj: unknown): number {
  if (!obj || typeof obj !== "object") {
    return 0;
  }
  let s = 0;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const face = Number.parseFloat(String(k).replace(",", "."));
    const qty = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(face) && Number.isFinite(qty) && qty >= 0) {
      s += face * qty;
    }
  }
  return Math.round(s * 100) / 100;
}

/** Indica se existe sessão aberta (PDV/cozinha sem expor valores). */
cashRegisterRouter.get("/open-status", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  const map = resolvePermissions(user);
  if (!canOpenPdv(user.role, map) && !canAccessKitchen(user.role, map)) {
    res.status(403).json({ error: "Sem permissão." });
    return;
  }
  const n = await prisma.cashRegister.count({ where: { closedAt: null } });
  res.json({ open: n > 0 });
});

/** Caixa aberto no momento (no máximo um). */
cashRegisterRouter.get("/current", requireCashRegisterView, async (_req, res) => {
  const open = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
    select: selectSession,
  });
  res.json({ current: open ? serializeSession(open) : null });
});

/** Histórico de turnos de caixa (mais recentes primeiro). */
cashRegisterRouter.get("/history", requireCashRegisterView, async (req, res) => {
  const raw = req.query.limit;
  const limit = Math.min(100, Math.max(1, Number(raw) || 50));
  const rows = await prisma.cashRegister.findMany({
    orderBy: { openedAt: "desc" },
    take: limit,
    select: selectSession,
  });
  res.json({ sessions: rows.map(serializeSession) });
});

/** Detalhe de uma sessão (fechada ou aberta), incluindo sangrias e suprimentos. */
cashRegisterRouter.get("/sessions/:id", requireCashRegisterView, async (req, res) => {
  const { id } = req.params;
  const row = await prisma.cashRegister.findUnique({
    where: { id },
    select: selectSession,
  });
  if (!row) {
    res.status(404).json({ error: "Sessão não encontrada." });
    return;
  }
  const movementRows = await prisma.cashMovement.findMany({
    where: { cashRegisterId: id },
    orderBy: { createdAt: "asc" },
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });
  res.json({
    session: serializeSession(row),
    movements: movementRows.map((m) => ({
      id: m.id,
      type: m.type,
      amount: m.amount,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
      createdBy: m.createdBy,
    })),
  });
});

/** Movimentações (sangria / suprimento) do caixa aberto. */
cashRegisterRouter.get("/movements", requireCashRegisterView, async (_req, res) => {
  const open = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  if (!open) {
    res.json({ movements: [] });
    return;
  }
  const rows = await prisma.cashMovement.findMany({
    where: { cashRegisterId: open.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });
  res.json({
    movements: rows.map((m) => ({
      id: m.id,
      type: m.type,
      amount: m.amount,
      note: m.note,
      createdAt: m.createdAt.toISOString(),
      createdBy: m.createdBy,
    })),
  });
});

cashRegisterRouter.post("/movements", requireVendasAction("abrir"), async (req, res) => {
  const open = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  if (!open) {
    res.status(409).json({ error: "Não há caixa aberto." });
    return;
  }

  const type = req.body?.type as CashMovementType | undefined;
  if (type !== "SANGRIA" && type !== "SUPRIMENTO") {
    res.status(400).json({ error: "Informe o tipo: SANGRIA ou SUPRIMENTO." });
    return;
  }

  const amount = parseMoney(req.body?.amount);
  if (amount === undefined || amount <= 0) {
    res.status(400).json({ error: "Informe um valor válido (> 0)." });
    return;
  }

  const note =
    typeof req.body?.note === "string" && req.body.note.trim() !== "" ? req.body.note.trim() : null;

  const created = await prisma.cashMovement.create({
    data: {
      cashRegisterId: open.id,
      type,
      amount,
      note,
      createdById: req.user!.sub,
    },
    include: {
      createdBy: { select: { id: true, name: true, login: true } },
    },
  });

  res.status(201).json({
    movement: {
      id: created.id,
      type: created.type,
      amount: created.amount,
      note: created.note,
      createdAt: created.createdAt.toISOString(),
      createdBy: created.createdBy,
    },
  });
});

cashRegisterRouter.post("/open", requireVendasAction("abrir"), async (req, res) => {
  const existing = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
  });
  if (existing) {
    res.status(409).json({ error: "Já existe um caixa aberto. Feche-o antes de abrir outro." });
    return;
  }

  const shift = parseShift(req.body?.shift) ?? "MANHA";
  const shiftCustomLabel =
    shift === "CUSTOM" && typeof req.body?.shiftCustomLabel === "string"
      ? req.body.shiftCustomLabel.trim().slice(0, 120) || null
      : null;
  const openingNotes =
    typeof req.body?.openingNotes === "string" && req.body.openingNotes.trim() !== ""
      ? req.body.openingNotes.trim().slice(0, 2000)
      : null;

  let denominations: Prisma.InputJsonValue | undefined;
  const rawDen = req.body?.denominations;
  if (rawDen !== undefined && rawDen !== null) {
    if (typeof rawDen !== "object" || Array.isArray(rawDen)) {
      res.status(400).json({ error: "Formato inválido para conferência de cédulas." });
      return;
    }
    denominations = rawDen as Prisma.InputJsonValue;
  }

  let initialValue = parseMoney(req.body?.initialValue);
  const sumFromDen = denominations ? sumDenominations(denominations) : 0;

  if (denominations && Object.keys(denominations as object).length > 0) {
    if (sumFromDen <= 0) {
      res.status(400).json({ error: "A conferência de cédulas não totalizou valor positivo." });
      return;
    }
    if (initialValue === undefined) {
      initialValue = sumFromDen;
    } else if (Math.abs(initialValue - sumFromDen) > 0.02) {
      res.status(400).json({
        error: `O valor informado (${initialValue}) não confere com a conferência de cédulas (${sumFromDen}).`,
      });
      return;
    }
  }

  if (initialValue === undefined || initialValue < 0) {
    res.status(400).json({ error: "Informe um valor inicial válido (≥ 0)." });
    return;
  }

  const created = await prisma.cashRegister.create({
    data: {
      openedById: req.user!.sub,
      initialValue,
      shift,
      shiftCustomLabel,
      openingNotes,
      denominationsJson: denominations ?? undefined,
    },
    select: selectSession,
  });

  res.status(201).json({ session: serializeSession(created) });
});

cashRegisterRouter.post("/close", requireVendasAction("fechar"), async (req, res) => {
  const open = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
  });
  if (!open) {
    res.status(409).json({ error: "Não há caixa aberto para fechar." });
    return;
  }

  let closingBalance: number | null = null;
  const raw = req.body?.closingBalance;
  if (raw !== undefined && raw !== null && raw !== "") {
    const n = parseMoney(raw);
    if (n === undefined || n < 0) {
      res.status(400).json({ error: "Valor de fechamento inválido." });
      return;
    }
    closingBalance = n;
  }

  const updated = await prisma.cashRegister.update({
    where: { id: open.id },
    data: {
      closedAt: new Date(),
      closedById: req.user!.sub,
      closingBalance,
    },
    select: selectSession,
  });

  res.json({ session: serializeSession(updated) });
});
