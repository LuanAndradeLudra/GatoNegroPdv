import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/** URL sem query string (Prisma usa ?schema=public; ferramentas pg podem falhar). */
export function sanitizedDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw?.trim()) {
    throw new Error("DATABASE_URL não está definida.");
  }
  try {
    const u = new URL(raw);
    u.search = "";
    return u.href;
  } catch {
    return raw;
  }
}

export function getBackupRootDir(): string {
  const fromEnv = process.env.BACKUP_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "data", "backups");
}

/** Pasta no formato dia_mes_ano_HHmmss (horário local do servidor). */
export function backupFolderName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getDate())}_${pad(now.getMonth() + 1)}_${now.getFullYear()}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function spawnOk(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `Comando "${cmd}" não encontrado. Instale o cliente PostgreSQL (pacote postgresql-client) ou use o PATH do sistema.`,
          ),
        );
        return;
      }
      reject(new Error(msg));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stderr.trim());
      } else {
        reject(new Error(stderr.trim() || `Comando terminou com código ${code}`));
      }
    });
  });
}

export async function runPgDumpSqlFile(outFile: string): Promise<void> {
  const url = sanitizedDatabaseUrl();
  await spawnOk("pg_dump", [
    "-d",
    url,
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-acl",
    "-f",
    outFile,
  ]);
}

export async function runPsqlRestore(sqlFile: string): Promise<void> {
  const url = sanitizedDatabaseUrl();
  await spawnOk("psql", ["-d", url, "-v", "ON_ERROR_STOP=1", "-f", sqlFile]);
}

export async function runPgRestoreCustom(dumpFile: string): Promise<void> {
  const url = sanitizedDatabaseUrl();
  await spawnOk("pg_restore", ["-d", url, "--clean", "--if-exists", "--no-owner", "--no-acl", dumpFile]);
}

export async function isPgCustomFormatDump(filePath: string): Promise<boolean> {
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(5);
    const { bytesRead } = await fh.read(buf, 0, 5, 0);
    return bytesRead >= 5 && buf.toString("ascii") === "PGDMP";
  } finally {
    await fh.close();
  }
}
