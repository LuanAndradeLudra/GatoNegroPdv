import type { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const role = req.user?.role;
  if (role !== "ADMIN") {
    res.status(403).json({ error: "Apenas administrador pode usar backup e restauração do banco." });
    return;
  }
  next();
}
