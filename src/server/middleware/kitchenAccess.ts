import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canAccessKitchen,
  canUpdateKitchen,
  resolvePermissions,
} from "../lib/permissions.js";

export async function requireKitchenView(
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
  if (!canAccessKitchen(user.role, map)) {
    res.status(403).json({ error: "Sem acesso à cozinha." });
    return;
  }
  next();
}

export async function requireKitchenUpdate(
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
  if (!canUpdateKitchen(user.role, map)) {
    res.status(403).json({ error: "Sem permissão para atualizar a cozinha." });
    return;
  }
  next();
}
