import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canAccessStockModule,
  resolvePermissions,
  stockAccessFlags,
  type StockAccessFlags,
} from "../lib/permissions.js";

async function loadUserMap(req: Request) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    return null;
  }
  return { user, map: resolvePermissions(user) };
}

export async function requireStockListAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!canAccessStockModule(data.user.role, data.map)) {
    res.status(403).json({ error: "Sem acesso ao estoque." });
    return;
  }
  next();
}

export async function requireStockProdutos(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  const f = stockAccessFlags(data.user.role, data.map);
  if (!f.produtos) {
    res.status(403).json({ error: "Sem permissão para cadastrar ou editar produtos." });
    return;
  }
  next();
}

/** Anexa flags em `req.stockAccess` para validar o tipo de movimento no POST. */
export async function attachStockAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!canAccessStockModule(data.user.role, data.map)) {
    res.status(403).json({ error: "Sem acesso ao estoque." });
    return;
  }
  req.stockAccess = stockAccessFlags(data.user.role, data.map);
  next();
}

declare global {
  namespace Express {
    interface Request {
      stockAccess?: StockAccessFlags;
    }
  }
}
