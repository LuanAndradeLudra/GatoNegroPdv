/**
 * Gera SQLite vazio com o schema atual (para copiar no primeiro run do app empacotado).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const dbPath = path.join(buildDir, "db-template.sqlite");

fs.mkdirSync(buildDir, { recursive: true });
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const url = `file:${dbPath.replace(/\\/g, "/")}`;
execSync("npx prisma db push --skip-generate", {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

console.log("[build-db-template] OK:", dbPath);
