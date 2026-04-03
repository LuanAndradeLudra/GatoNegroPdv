import "dotenv/config";
import { createApp } from "./app.js";

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "production") {
  process.env.JWT_SECRET = "dev-jwt-secret-change-in-.env";
}

const port = Number(process.env.API_PORT) || 3001;
const app = createApp();

app.listen(port, "127.0.0.1", () => {
  console.log(`[api] http://127.0.0.1:${port}`);
});
