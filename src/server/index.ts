import "dotenv/config";
import { createApp } from "./app.js";

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "production") {
  process.env.JWT_SECRET = "dev-jwt-secret-change-in-.env";
}

const port = Number(process.env.API_PORT) || 3001;
const host = process.env.HOST ?? "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  console.log(`[api] http://${host}:${port}`);
});
