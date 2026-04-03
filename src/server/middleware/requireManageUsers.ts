import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { canManageUsers } from "../lib/permissions.js";

export function requireManageUsers(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (!role || !canManageUsers(role as UserRole)) {
    res.status(403).json({ error: "Sem permissão para gerenciar usuários." });
    return;
  }
  next();
}
