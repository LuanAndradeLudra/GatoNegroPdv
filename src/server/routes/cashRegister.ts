import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
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
  openedBy: { select: { id: true, name: true, login: true } },
  closedBy: { select: { id: true, name: true, login: true } },
} as const;

type SessionRow = {
  id: string;
  openedAt: Date;
  initialValue: number;
  closedAt: Date | null;
  closingBalance: number | null;
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

cashRegisterRouter.post("/open", requireVendasAction("abrir"), async (req, res) => {
  const existing = await prisma.cashRegister.findFirst({
    where: { closedAt: null },
  });
  if (existing) {
    res.status(409).json({ error: "Já existe um caixa aberto. Feche-o antes de abrir outro." });
    return;
  }

  const initialValue = parseMoney(req.body?.initialValue);
  if (initialValue === undefined || initialValue < 0) {
    res.status(400).json({ error: "Informe um valor inicial válido (≥ 0)." });
    return;
  }

  const created = await prisma.cashRegister.create({
    data: {
      openedById: req.user!.sub,
      initialValue,
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
