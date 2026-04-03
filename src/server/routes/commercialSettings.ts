import type { CommercialChargeMode } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireManageSettings } from "../middleware/requireManageSettings.js";

export const commercialSettingsRouter = Router();
commercialSettingsRouter.use(authMiddleware);

const MODES: CommercialChargeMode[] = ["PERCENT", "FIXED"];

function parseMode(raw: unknown): CommercialChargeMode | undefined {
  return typeof raw === "string" && MODES.includes(raw as CommercialChargeMode) ? (raw as CommercialChargeMode) : undefined;
}

function serialize(row: {
  id: string;
  couvertEnabled: boolean;
  couvertMode: CommercialChargeMode;
  couvertValue: number;
  serviceFeeEnabled: boolean;
  serviceFeeMode: CommercialChargeMode;
  serviceFeeValue: number;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    couvertEnabled: row.couvertEnabled,
    couvertMode: row.couvertMode,
    couvertValue: row.couvertValue,
    serviceFeeEnabled: row.serviceFeeEnabled,
    serviceFeeMode: row.serviceFeeMode,
    serviceFeeValue: row.serviceFeeValue,
    updatedAt: row.updatedAt.toISOString(),
  };
}

commercialSettingsRouter.get("/", async (_req, res) => {
  let row = await prisma.commercialSettings.findUnique({ where: { id: "default" } });
  if (!row) {
    row = await prisma.commercialSettings.create({ data: { id: "default" } });
  }
  res.json({ settings: serialize(row) });
});

commercialSettingsRouter.patch("/", requireManageSettings, async (req, res) => {
  const data: {
    couvertEnabled?: boolean;
    couvertMode?: CommercialChargeMode;
    couvertValue?: number;
    serviceFeeEnabled?: boolean;
    serviceFeeMode?: CommercialChargeMode;
    serviceFeeValue?: number;
  } = {};

  if (typeof req.body?.couvertEnabled === "boolean") {
    data.couvertEnabled = req.body.couvertEnabled;
  }
  if (req.body?.couvertMode !== undefined) {
    const m = parseMode(req.body.couvertMode);
    if (!m) {
      res.status(400).json({ error: "couvertMode inválido (PERCENT ou FIXED)." });
      return;
    }
    data.couvertMode = m;
  }
  if (req.body?.couvertValue !== undefined) {
    const n =
      typeof req.body.couvertValue === "number"
        ? req.body.couvertValue
        : Number.parseFloat(String(req.body.couvertValue).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "couvertValue inválido." });
      return;
    }
    data.couvertValue = Math.round(n * 1000) / 1000;
  }

  if (typeof req.body?.serviceFeeEnabled === "boolean") {
    data.serviceFeeEnabled = req.body.serviceFeeEnabled;
  }
  if (req.body?.serviceFeeMode !== undefined) {
    const m = parseMode(req.body.serviceFeeMode);
    if (!m) {
      res.status(400).json({ error: "serviceFeeMode inválido (PERCENT ou FIXED)." });
      return;
    }
    data.serviceFeeMode = m;
  }
  if (req.body?.serviceFeeValue !== undefined) {
    const n =
      typeof req.body.serviceFeeValue === "number"
        ? req.body.serviceFeeValue
        : Number.parseFloat(String(req.body.serviceFeeValue).replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "serviceFeeValue inválido." });
      return;
    }
    data.serviceFeeValue = Math.round(n * 1000) / 1000;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "Nada para atualizar." });
    return;
  }

  const row = await prisma.commercialSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...data,
    },
    update: data,
  });

  res.json({ settings: serialize(row) });
});
