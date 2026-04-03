import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canOpenPdv,
  hasPermission,
  resolvePermissions,
} from "../lib/permissions.js";

export function requireVendasAction(action: "abrir" | "fechar") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      res.status(401).json({ error: "Usuário não encontrado." });
      return;
    }
    const map = resolvePermissions(user);
    if (!hasPermission(map, "VENDAS", action)) {
      res.status(403).json({ error: "Sem permissão para esta operação de caixa." });
      return;
    }
    next();
  };
}

export async function requireCashRegisterView(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  const map = resolvePermissions(user);
  if (!canOpenPdv(user.role, map)) {
    res.status(403).json({ error: "Sem permissão para acessar o caixa." });
    return;
  }
  next();
}
