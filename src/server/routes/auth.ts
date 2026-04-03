import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import {
  canAccessClients,
  canAccessFinanceiro,
  canAccessKitchen,
  canManageUsers,
  canOpenErp,
  canOpenPdv,
  canViewCustomerOrders,
  resolvePermissions,
  stockAccessFlags,
} from "../lib/permissions.js";
import { authMiddleware, signToken } from "../middleware/auth.js";

export const authRouter = Router();

function serializeSessionUser(user: {
  id: string;
  name: string;
  login: string;
  role: import("@prisma/client").UserRole;
  permissions: unknown;
}) {
  const permissions = resolvePermissions(user);
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    permissions,
    access: {
      pdv: canOpenPdv(user.role, permissions),
      erp: canOpenErp(user.role, permissions),
      manageUsers: canManageUsers(user.role),
      kitchen: canAccessKitchen(user.role, permissions),
      clients: canAccessClients(user.role, permissions),
      customerOrders: canViewCustomerOrders(user.role, permissions),
      stock: stockAccessFlags(user.role, permissions),
      financeiro: canAccessFinanceiro(user.role, permissions),
    },
  };
}

authRouter.post("/login", async (req, res) => {
  const login = typeof req.body?.login === "string" ? req.body.login.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!login || !password) {
    res.status(400).json({ error: "Informe login e senha." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { login: login.toLowerCase() } });
  if (!user) {
    res.status(401).json({ error: "Login ou senha inválidos." });
    return;
  }

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) {
    res.status(401).json({ error: "Login ou senha inválidos." });
    return;
  }

  const token = signToken({ sub: user.id, login: user.login, role: user.role });

  res.json({
    token,
    user: serializeSessionUser(user),
  });
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, name: true, login: true, role: true, permissions: true },
  });
  if (!user) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  res.json({ user: serializeSessionUser(user) });
});
