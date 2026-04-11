import { Router } from "express";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import { authMiddleware } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { prisma } from "../lib/prisma.js";
import {
  backupFolderName,
  getBackupRootDir,
  isPgCustomFormatDump,
  runPgDumpSqlFile,
  runPgRestoreCustom,
  runPsqlRestore,
} from "../lib/pgTools.js";

export const databaseBackupRouter = Router();

databaseBackupRouter.use(authMiddleware);
databaseBackupRouter.use(requireAdmin);

const restoreUploadDir = path.join(os.tmpdir(), "gnpdv-restore");
mkdirSync(restoreUploadDir, { recursive: true });

const uploadRestore = multer({
  dest: restoreUploadDir,
  limits: { fileSize: 512 * 1024 * 1024 },
});

databaseBackupRouter.post("/backup", async (_req, res) => {
  let root: string;
  try {
    root = getBackupRootDir();
    await fs.mkdir(root, { recursive: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Erro de configuração." });
    return;
  }

  const baseName = backupFolderName();
  let dir: string | null = null;
  for (let i = 0; i < 100; i++) {
    const name = i === 0 ? baseName : `${baseName}_${i}`;
    const candidate = path.join(root, name);
    try {
      await fs.mkdir(candidate, { recursive: false });
      dir = candidate;
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao criar pasta de backup." });
        return;
      }
    }
  }
  if (!dir) {
    res.status(500).json({ error: "Não foi possível criar pasta de backup (muitas colisões de nome)." });
    return;
  }

  const dumpFile = path.join(dir, "dump.sql");

  try {
    await runPgDumpSqlFile(dumpFile);
  } catch (e) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Falha no pg_dump.";
    res.status(500).json({ error: msg });
    return;
  }

  res.json({
    ok: true,
    folder: path.basename(dir),
    directory: dir,
    fileName: "dump.sql",
  });
});

databaseBackupRouter.post("/restore", uploadRestore.single("file"), async (req, res) => {
  const file = req.file;
  if (!file?.path) {
    res.status(400).json({ error: "Envie um arquivo de backup (campo file)." });
    return;
  }

  const uploadedPath = file.path;

  try {
    const custom = await isPgCustomFormatDump(uploadedPath);

    await prisma.$disconnect();

    try {
      if (custom) {
        await runPgRestoreCustom(uploadedPath);
      } else {
        await runPsqlRestore(uploadedPath);
      }
    } finally {
      await prisma.$connect();
    }
  } catch (e) {
    try {
      await prisma.$connect();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Falha ao restaurar.";
    res.status(500).json({ error: msg });
    return;
  } finally {
    try {
      await fs.unlink(uploadedPath);
    } catch {
      /* ignore */
    }
  }

  res.json({
    ok: true,
    message: "Banco restaurado. Recarregue a página para sincronizar a sessão com os novos dados.",
  });
});
