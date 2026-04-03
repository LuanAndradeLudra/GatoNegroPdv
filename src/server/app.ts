import express from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { cashRegisterRouter } from "./routes/cashRegister.js";

export function createApp(): express.Application {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/cash-register", cashRegisterRouter);

  if (process.env.NODE_ENV === "production") {
    const staticDir = path.join(process.cwd(), "dist");
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
