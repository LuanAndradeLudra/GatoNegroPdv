import express from "express";
import cors from "cors";
import path from "path";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { cashRegisterRouter } from "./routes/cashRegister.js";
import { pdvRouter } from "./routes/pdv.js";
import { kitchenRouter } from "./routes/kitchen.js";
import { customersRouter } from "./routes/customers.js";
import { paymentMethodsRouter } from "./routes/paymentMethods.js";
import { stockRouter } from "./routes/stock.js";
import { financeRouter } from "./routes/finance.js";
import { commercialSettingsRouter } from "./routes/commercialSettings.js";

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
  app.use("/api/pdv", pdvRouter);
  app.use("/api/kitchen", kitchenRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/payment-methods", paymentMethodsRouter);
  app.use("/api/stock", stockRouter);
  app.use("/api/finance", financeRouter);
  app.use("/api/commercial-settings", commercialSettingsRouter);

  if (process.env.NODE_ENV === "production") {
    const staticDir = path.join(process.cwd(), "dist");
    app.use(express.static(staticDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
