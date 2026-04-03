import { useCallback, useEffect, useState } from "react";
import { apiKitchenBoard, apiKitchenSetStatus, type KitchenBoardItem } from "./api";
import { useAuth } from "./AuthContext";
import { Button } from "./ui/Button";

const BOARD_COLUMNS: {
  title: string;
  statuses: KitchenBoardItem["kitchenStatus"][];
}[] = [
  { title: "Fila", statuses: ["QUEUE", "PENDING"] },
  { title: "Preparando", statuses: ["PREPARING"] },
  { title: "Pronto", statuses: ["READY"] },
];

function orderLabel(kind: KitchenBoardItem["orderKind"], clientName: string | null): string {
  if (kind === "COMANDA") {
    return clientName?.trim() ? `Comanda · ${clientName}` : "Comanda rápida";
  }
  return "Balcão";
}

export function KitchenScreen() {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const user = state.status === "authenticated" ? state.user : null;

  const canUpdate =
    user &&
    (user.role === "ADMIN" ||
      user.role === "GERENTE" ||
      user.permissions.COZINHA.includes("atualizar"));

  const [items, setItems] = useState<KitchenBoardItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const data = await apiKitchenBoard(token);
      setItems(data.items);
      setLastSync(data.serverTime);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [load]);

  async function advance(item: KitchenBoardItem, next: "PREPARING" | "READY") {
    if (!token || !canUpdate) {
      return;
    }
    setBusyId(item.itemId);
    setError(null);
    try {
      await apiKitchenSetStatus(token, item.itemId, next);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusyId(null);
    }
  }

  function itemsInColumn(statuses: KitchenBoardItem["kitchenStatus"][]): KitchenBoardItem[] {
    return items.filter((i) => statuses.includes(i.kitchenStatus));
  }

  if (!token || !user) {
    return null;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-zinc-500">
            Pedidos do PDV na fila · {lastSync ? `sync ${new Date(lastSync).toLocaleTimeString("pt-BR")}` : "…"} · a cada 3s
          </p>
        </div>
        <Button type="button" variant="outline" className="!py-2 text-xs" onClick={() => void load()} disabled={!!busyId}>
          Atualizar
        </Button>
      </div>

      {error ? <p className="border-b border-red-500/20 bg-red-950/30 px-4 py-2 text-sm text-red-300 sm:px-6">{error}</p> : null}

      {!canUpdate ? (
        <p className="px-4 py-2 text-sm text-zinc-500 sm:px-6">Somente visualização — sem permissão para alterar status.</p>
      ) : null}

      <div className="grid flex-1 grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-6">
        {BOARD_COLUMNS.map((col) => (
          <section
            key={col.title}
            className="flex min-h-[200px] flex-col rounded-xl border border-white/[0.08] bg-[#161616]/80 backdrop-blur-sm"
          >
            <h2 className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5 text-sm font-semibold text-zinc-200">
              {col.title}
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px] font-normal text-zinc-400">
                {itemsInColumn(col.statuses).length}
              </span>
            </h2>
            <div className="flex max-h-[calc(100vh-220px)] flex-col gap-2 overflow-auto p-2">
              {itemsInColumn(col.statuses).map((item) => (
                <article
                  key={item.itemId}
                  className="rounded-lg border border-white/[0.08] bg-[#1e1e1e]/90 p-3 shadow-sm"
                >
                  <header className="mb-2 flex justify-between gap-2">
                    <span className="text-xs text-zinc-500">{orderLabel(item.orderKind, item.clientName)}</span>
                    <span className="whitespace-nowrap text-[11px] font-semibold text-amber-500/90" title="Tempo desde a abertura do pedido">
                      {item.minutesWaiting} min
                    </span>
                  </header>
                  <p className="mb-2 text-sm">
                    <strong className="text-zinc-100">{item.productName}</strong>
                    <span className="ml-1.5 text-zinc-500">× {item.quantity}</span>
                  </p>
                  {canUpdate ? (
                    <div className="flex flex-wrap gap-2">
                      {item.kitchenStatus === "QUEUE" || item.kitchenStatus === "PENDING" ? (
                        <Button
                          type="button"
                          className="!px-3 !py-1.5 text-xs"
                          disabled={busyId === item.itemId}
                          onClick={() => void advance(item, "PREPARING")}
                        >
                          Preparar
                        </Button>
                      ) : null}
                      {item.kitchenStatus === "PREPARING" ? (
                        <Button
                          type="button"
                          className="!px-3 !py-1.5 text-xs"
                          disabled={busyId === item.itemId}
                          onClick={() => void advance(item, "READY")}
                        >
                          Pronto
                        </Button>
                      ) : null}
                      {item.kitchenStatus === "READY" ? (
                        <span className="text-xs text-emerald-400/90">Aguardando retirada / servir</span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
