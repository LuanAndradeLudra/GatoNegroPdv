import type { Response } from "express";

/** Clientes SSE inscritos para atualização de estoque (PDV / ERP). */
const sseClients = new Set<Response>();

export function registerStockSseClient(res: Response): () => void {
  sseClients.add(res);
  return () => {
    sseClients.delete(res);
  };
}

export function notifyStockChanged(): void {
  const payload = `data: ${JSON.stringify({ type: "stock" as const, t: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}
