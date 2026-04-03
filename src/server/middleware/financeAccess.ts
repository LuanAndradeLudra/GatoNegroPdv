import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { canAccessFinanceiro, resolvePermissions } from "../lib/permissions.js";

export async function requireFinanceiro(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  const map = resolvePermissions(user);
  if (!canAccessFinanceiro(user.role, map)) {
    res.status(403).json({ error: "Sem acesso ao módulo financeiro." });
    return;
  }
  next();
}
