import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type JwtPayload = { sub: string; login: string };

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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.user = decoded;
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
