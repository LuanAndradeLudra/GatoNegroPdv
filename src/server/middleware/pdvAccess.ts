import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { canOpenPdv, resolvePermissions } from "../lib/permissions.js";

export async function requirePdvAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  const map = resolvePermissions(user);
  if (!canOpenPdv(user.role, map)) {
    res.status(403).json({ error: "Sem acesso ao PDV." });
    return;
  }
  next();
}

export async function requireOpenCashRegister(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const open = await prisma.cashRegister.findFirst({ where: { closedAt: null } });
  if (!open) {
    res.status(403).json({ error: "Abra o caixa antes de registrar vendas." });
    return;
  }
  next();
}
