import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  MODULE_ACTIONS,
  PERMISSION_MODULES,
  defaultPermissionsForRole,
  mergePermissionsInput,
  parsePermissionsInput,
  resolvePermissions,
} from "../lib/permissions.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireManageUsers } from "../middleware/requireManageUsers.js";

export const usersRouter = Router();

usersRouter.use(authMiddleware);
usersRouter.use(requireManageUsers);

const LOGIN_RE = /^[a-z0-9._-]{3,64}$/i;

function publicUser(u: {
  id: string;
  name: string;
  login: string;
  role: UserRole;
  permissions: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    login: u.login,
    role: u.role,
    permissions: resolvePermissions(u),
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

usersRouter.get("/permissions-schema", (_req, res) => {
  const roles: UserRole[] = ["ADMIN", "GERENTE", "VENDEDOR", "ESTOQUE", "COZINHA", "CONFERENTE"];
  const defaultsByRole = Object.fromEntries(
    roles.map((r) => [r, defaultPermissionsForRole(r)]),
  ) as Record<UserRole, ReturnType<typeof defaultPermissionsForRole>>;
  res.json({
    modules: [...PERMISSION_MODULES],
    actions: MODULE_ACTIONS,
    defaultsByRole,
  });
});

usersRouter.get("/", async (_req, res) => {
  const rows = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  res.json({ users: rows.map(publicUser) });
});

usersRouter.post("/", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const login = typeof req.body?.login === "string" ? req.body.login.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role as UserRole | undefined;
  const roles: UserRole[] = [
    "ADMIN",
    "GERENTE",
    "VENDEDOR",
    "ESTOQUE",
    "COZINHA",
    "CONFERENTE",
  ];
  if (!name || !LOGIN_RE.test(login) || password.length < 6 || !role || !roles.includes(role)) {
    res.status(400).json({
      error:
        "Dados inválidos. Nome obrigatório, login 3–64 caracteres (letras, números, . _ -), senha mínimo 6 caracteres, papel válido.",
    });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { login } });
  if (existing) {
    res.status(409).json({ error: "Já existe usuário com este login." });
    return;
  }

  const partial = parsePermissionsInput(req.body?.permissions);
  const merged = mergePermissionsInput(role, partial);
  const hash = bcrypt.hashSync(password, 10);

  const created = await prisma.user.create({
    data: {
      name,
      login,
      password: hash,
      role,
      permissions: merged as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json({ user: publicUser(created) });
});

usersRouter.get("/:id", async (req, res) => {
  const row = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  res.json({ user: publicUser(row) });
});

usersRouter.patch("/:id", async (req, res) => {
  const id = req.params.id;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const loginRaw = typeof req.body?.login === "string" ? req.body.login.trim().toLowerCase() : undefined;
  const password = typeof req.body?.password === "string" ? req.body.password : undefined;
  const role = req.body?.role as UserRole | undefined;
  const roles: UserRole[] = [
    "ADMIN",
    "GERENTE",
    "VENDEDOR",
    "ESTOQUE",
    "COZINHA",
    "CONFERENTE",
  ];

  if (name !== undefined && !name) {
    res.status(400).json({ error: "Nome inválido." });
    return;
  }
  if (loginRaw !== undefined && !LOGIN_RE.test(loginRaw)) {
    res.status(400).json({ error: "Login inválido." });
    return;
  }
  if (password !== undefined && password.length < 6) {
    res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
    return;
  }
  if (role !== undefined && !roles.includes(role)) {
    res.status(400).json({ error: "Papel inválido." });
    return;
  }

  const nextRole = role ?? current.role;

  if (current.role === "ADMIN" && nextRole !== "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      res.status(400).json({ error: "Não é possível remover o único administrador do sistema." });
      return;
    }
  }

  if (loginRaw !== undefined && loginRaw !== current.login) {
    const taken = await prisma.user.findUnique({ where: { login: loginRaw } });
    if (taken) {
      res.status(409).json({ error: "Já existe usuário com este login." });
      return;
    }
  }

  const data: {
    name?: string;
    login?: string;
    password?: string;
    role?: UserRole;
    permissions?: Prisma.InputJsonValue;
  } = {};
  if (name !== undefined) data.name = name;
  if (loginRaw !== undefined) data.login = loginRaw;
  if (password !== undefined) data.password = bcrypt.hashSync(password, 10);
  if (role !== undefined) data.role = role;

  if (req.body.permissions !== undefined) {
    if (req.body.permissions === null) {
      data.permissions = mergePermissionsInput(nextRole, null) as Prisma.InputJsonValue;
    } else {
      const partial = parsePermissionsInput(req.body.permissions);
      if (partial === null) {
        res.status(400).json({ error: "Formato de permissões inválido." });
        return;
      }
      data.permissions = mergePermissionsInput(nextRole, partial) as Prisma.InputJsonValue;
    }
  } else if (role !== undefined && role !== current.role) {
    data.permissions = mergePermissionsInput(nextRole, null) as Prisma.InputJsonValue;
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      login: true,
      role: true,
      permissions: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({ user: publicUser(updated) });
});

usersRouter.delete("/:id", async (req, res) => {
  const id = req.params.id;
  if (id === req.user!.sub) {
    res.status(400).json({ error: "Não é possível excluir o próprio usuário." });
    return;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }

  if (target.role === "ADMIN") {
    const admins = await prisma.user.count({ where: { role: "ADMIN" } });
    if (admins <= 1) {
      res.status(400).json({ error: "Não é possível excluir o único administrador do sistema." });
      return;
    }
  }

  await prisma.user.delete({ where: { id } });
  res.status(204).send();
});
