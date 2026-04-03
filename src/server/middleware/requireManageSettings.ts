import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { canManageUsers } from "../lib/permissions.js";

/** Formas de pagamento e cadastros de configuração do PDV (ADMIN / GERENTE). */
export function requireManageSettings(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role || !canManageUsers(role as UserRole)) {
    res.status(403).json({ error: "Sem permissão para alterar configurações." });
    return;
  }
  next();
}
