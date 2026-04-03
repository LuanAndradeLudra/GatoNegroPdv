import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canAccessClients,
  canViewCustomerOrders,
  hasPermission,
  resolvePermissions,
} from "../lib/permissions.js";

async function loadUserMap(req: Request) {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    return null;
  }
  return { user, map: resolvePermissions(user) };
}

export async function requireClientsAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!canAccessClients(data.user.role, data.map)) {
    res.status(403).json({ error: "Sem acesso a clientes." });
    return;
  }
  next();
}

export async function requireClientsCadastrar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!hasPermission(data.map, "CLIENTES", "cadastrar") && data.user.role !== "ADMIN" && data.user.role !== "GERENTE") {
    res.status(403).json({ error: "Sem permissão para cadastrar clientes." });
    return;
  }
  next();
}

export async function requireClientsEditar(req: Request, res: Response, next: NextFunction): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!hasPermission(data.map, "CLIENTES", "editar") && data.user.role !== "ADMIN" && data.user.role !== "GERENTE") {
    res.status(403).json({ error: "Sem permissão para editar clientes." });
    return;
  }
  next();
}

export async function requireCustomerOrdersReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const data = await loadUserMap(req);
  if (!data) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!canViewCustomerOrders(data.user.role, data.map)) {
    res.status(403).json({ error: "Sem permissão para ver comandas do cliente." });
    return;
  }
  next();
}
