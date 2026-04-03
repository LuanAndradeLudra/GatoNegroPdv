import { useCallback, useEffect, useState } from "react";
import { apiKitchenBoard, apiKitchenSetStatus, type KitchenBoardItem } from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";

const BOARD_COLUMNS: {
  title: string;
  statuses: KitchenBoardItem["kitchenStatus"][];
  accent: "slate" | "amber" | "emerald";
}[] = [
  { title: "Fila", statuses: ["QUEUE", "PENDING"], accent: "slate" },
  { title: "Preparando", statuses: ["PREPARING"], accent: "amber" },
  { title: "Pronto", statuses: ["READY"], accent: "emerald" },
];

const columnHeaderClass: Record<(typeof BOARD_COLUMNS)[number]["accent"], string> = {
  slate: "border-slate-200 bg-slate-50/90 text-slate-800 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-100",
  amber: "border-amber-200/80 bg-amber-50/90 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100",
  emerald:
    "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
};

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
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Operação</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Cozinha</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
            Fila de preparo ·{" "}
            {lastSync ? `Último sync ${new Date(lastSync).toLocaleTimeString("pt-BR")}` : "Carregando…"} · atualização a
            cada 3s
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0 !py-2 text-xs" onClick={() => void load()} disabled={!!busyId}>
          Atualizar
        </Button>
      </div>

      {error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {!canUpdate ? (
        <p className="mt-6 text-sm text-slate-500 dark:text-zinc-500">Somente visualização — sem permissão para alterar status.</p>
      ) : null}

      <div className="mt-6 grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
        {BOARD_COLUMNS.map((col) => (
          <section
            key={col.title}
            className="flex min-h-[220px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40 dark:shadow-none"
          >
            <h2
              className={cn(
                "flex items-center justify-between border-b px-3 py-2.5 text-sm font-semibold",
                columnHeaderClass[col.accent],
              )}
            >
              {col.title}
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600 shadow-sm dark:bg-zinc-900/80 dark:text-zinc-400">
                {itemsInColumn(col.statuses).length}
              </span>
            </h2>
            <div className="flex max-h-[calc(100vh-280px)] flex-col gap-2 overflow-auto p-2.5">
              {itemsInColumn(col.statuses).map((item) => (
                <article
                  key={item.itemId}
                  className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/70"
                >
                  <header className="mb-2 flex justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-zinc-500">{orderLabel(item.orderKind, item.clientName)}</span>
                    <span
                      className="whitespace-nowrap text-[11px] font-semibold text-amber-700 dark:text-amber-400/90"
                      title="Tempo desde a abertura do pedido"
                    >
                      {item.minutesWaiting} min
                    </span>
                  </header>
                  <p className="mb-2 text-sm">
                    <strong className="text-slate-900 dark:text-zinc-100">{item.productName}</strong>
                    <span className="ml-1.5 text-slate-500 dark:text-zinc-500">× {item.quantity}</span>
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
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400/90">
                          Aguardando retirada / servir
                        </span>
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
