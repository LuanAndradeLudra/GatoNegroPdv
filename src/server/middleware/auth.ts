import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";

export type JwtPayload = { sub: string; login: string; role: UserRole };

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}

function parseJwtPayload(decoded: jwt.JwtPayload): JwtPayload | null {
  const sub = decoded.sub;
  const login = (decoded as Record<string, unknown>).login;
  const role = (decoded as Record<string, unknown>).role;
  if (typeof sub !== "string" || typeof login !== "string" || typeof role !== "string") {
    return null;
  }
  return { sub, login, role: role as UserRole };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    const payload = parseJwtPayload(decoded);
    if (!payload) {
      res.status(401).json({ error: "Sessão inválida. Faça login novamente." });
      return;
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
