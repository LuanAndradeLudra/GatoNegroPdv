import { useCallback, useEffect, useMemo, useState } from "react";
import { ChefHat, ClipboardList, Store } from "lucide-react";
import {
  apiKitchenBoard,
  apiKitchenPickup,
  apiKitchenSetStatus,
  type KitchenBoardItem,
} from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";

const COL_QUEUE: KitchenBoardItem["kitchenStatus"][] = ["QUEUE", "PENDING"];
const COL_PREPARING: KitchenBoardItem["kitchenStatus"][] = ["PREPARING"];
const COL_READY: KitchenBoardItem["kitchenStatus"][] = ["READY"];

const BOARD_COLUMNS: {
  id: string;
  title: string;
  statuses: KitchenBoardItem["kitchenStatus"][];
  headerClass: string;
}[] = [
  {
    id: "fila",
    title: "Fila",
    statuses: COL_QUEUE,
    headerClass:
      "border-b-2 border-blue-600 bg-blue-950/50 text-blue-100 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-50",
  },
  {
    id: "prep",
    title: "Preparando",
    statuses: COL_PREPARING,
    headerClass:
      "border-b-2 border-orange-500 bg-orange-950/40 text-orange-100 dark:border-orange-500 dark:bg-orange-950/50 dark:text-orange-50",
  },
  {
    id: "ready",
    title: "Pronto",
    statuses: COL_READY,
    headerClass:
      "border-b-2 border-emerald-600 bg-emerald-950/40 text-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-50",
  },
];

/** Cores por tempo desde abertura do pedido (SLA visual). */
function waitVisualClass(minutes: number): string {
  const m = Math.max(0, minutes);
  if (m <= 5) {
    return "bg-emerald-600 text-white dark:bg-emerald-700";
  }
  if (m < 15) {
    return "bg-amber-500 text-zinc-950 dark:bg-amber-500 dark:text-zinc-950";
  }
  return "bg-red-600 text-white dark:bg-red-700";
}

function formatMinutesLabel(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m >= 1440) {
    const d = Math.floor(m / 1440);
    return `${d}d`;
  }
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest > 0 ? `${h}h${rest}m` : `${h}h`;
  }
  return `${m} min`;
}

function comandaHeadline(item: KitchenBoardItem): string {
  if (item.orderKind === "COMANDA") {
    const n = item.clientName?.trim();
    return n ? n.toUpperCase() : "COMANDA";
  }
  return "BALCÃO";
}

function KitchenCard({
  item,
  canUpdate,
  busyId,
  onAdvance,
  onPickup,
}: {
  item: KitchenBoardItem;
  canUpdate: boolean;
  busyId: string | null;
  onAdvance: (item: KitchenBoardItem, next: "PREPARING" | "READY") => void;
  onPickup: (item: KitchenBoardItem) => void;
}) {
  const busy = busyId === item.itemId;
  const qtyLabel =
    item.quantity === Math.floor(item.quantity) ? String(Math.floor(item.quantity)) : String(item.quantity);

  return (
    <article
      className={cn(
        "flex min-h-[140px] flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {item.orderKind === "DIRECT" ? (
            <Store className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-500" aria-hidden />
          ) : (
            <ClipboardList className="h-4 w-4 shrink-0 text-slate-500 dark:text-zinc-500" aria-hidden />
          )}
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
            {item.orderKind === "DIRECT" ? "Balcão" : "Mesa / nome"}
          </span>
        </div>
      </div>

      <p className="mb-2 truncate text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-zinc-50">
        {comandaHeadline(item)}
      </p>

      <p className="mb-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-zinc-100 sm:text-lg">
        <span className="tabular-nums text-slate-600 dark:text-zinc-400">{qtyLabel}×</span> {item.productName}
      </p>

      {item.note ? (
        <div className="mb-3 rounded-lg border border-red-700/80 bg-red-600 px-3 py-2 text-center text-sm font-bold uppercase leading-snug text-white shadow-inner dark:border-red-500 dark:bg-red-700">
          {item.note}
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
        <span
          className={cn(
            "inline-flex min-h-[2rem] items-center rounded-lg px-2.5 py-1 text-xs font-bold tabular-nums",
            waitVisualClass(item.minutesWaiting),
          )}
          title="Tempo desde a abertura do pedido"
        >
          {formatMinutesLabel(item.minutesWaiting)}
        </span>

        {canUpdate ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {item.kitchenStatus === "QUEUE" || item.kitchenStatus === "PENDING" ? (
              <Button
                type="button"
                className="!px-3 !py-1.5 !text-xs font-semibold"
                disabled={busy}
                onClick={() => onAdvance(item, "PREPARING")}
              >
                Preparar
              </Button>
            ) : null}
            {item.kitchenStatus === "PREPARING" ? (
              <Button
                type="button"
                className="!border-orange-600/80 !bg-orange-600 !px-3 !py-1.5 !text-xs font-semibold !text-white hover:!bg-orange-700 dark:!bg-orange-600 dark:hover:!bg-orange-500"
                disabled={busy}
                onClick={() => onAdvance(item, "READY")}
              >
                Finalizar
              </Button>
            ) : null}
            {item.kitchenStatus === "READY" ? (
              <Button
                type="button"
                className="!border-emerald-700 !bg-emerald-600 !px-3 !py-1.5 !text-xs font-semibold !text-white hover:!bg-emerald-700 dark:!bg-emerald-600 dark:hover:!bg-emerald-500"
                disabled={busy}
                onClick={() => onPickup(item)}
              >
                Entregar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
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

  const stats = useMemo(() => {
    const queue = items.filter((i) => COL_QUEUE.includes(i.kitchenStatus));
    const prep = items.filter((i) => COL_PREPARING.includes(i.kitchenStatus));
    const ready = items.filter((i) => COL_READY.includes(i.kitchenStatus));
    const avgQueue =
      queue.length > 0
        ? Math.round(queue.reduce((s, i) => s + i.minutesWaiting, 0) / queue.length)
        : null;
    return { queue: queue.length, prep: prep.length, ready: ready.length, avgQueue };
  }, [items]);

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

  async function pickup(item: KitchenBoardItem) {
    if (!token || !canUpdate) {
      return;
    }
    setBusyId(item.itemId);
    setError(null);
    try {
      await apiKitchenPickup(token, item.itemId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar entrega");
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
    <div className="mx-auto flex min-h-full w-full max-w-[1920px] flex-col px-4 py-6 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Operação</p>
          <div className="mt-1 flex items-center gap-2">
            <ChefHat className="h-7 w-7 text-slate-700 dark:text-zinc-300" strokeWidth={1.75} aria-hidden />
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">Cozinha</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
            Atualização automática a cada 3s
            {lastSync ? ` · último sync ${new Date(lastSync).toLocaleTimeString("pt-BR")}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
            <span className="font-semibold text-slate-900 dark:text-zinc-100">Fila: {stats.queue}</span>
            <span className="mx-2 text-slate-300 dark:text-zinc-600">|</span>
            <span>Preparando: {stats.prep}</span>
            <span className="mx-2 text-slate-300 dark:text-zinc-600">|</span>
            <span>Prontos: {stats.ready}</span>
            {stats.avgQueue != null ? (
              <>
                <span className="mx-2 text-slate-300 dark:text-zinc-600">|</span>
                <span title="Média de minutos (pedido aberto) na fila">Tempo médio fila: {stats.avgQueue} min</span>
              </>
            ) : null}
          </div>
          <Button type="button" variant="outline" className="!py-2 !text-xs" onClick={() => void load()} disabled={!!busyId}>
            Atualizar agora
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {!canUpdate ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">Somente visualização — sem permissão para alterar status.</p>
      ) : null}

      <div className="mt-5 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        {BOARD_COLUMNS.map((col) => (
          <section
            key={col.id}
            className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40 dark:shadow-none"
          >
            <h2 className={cn("flex items-center justify-between px-3 py-3 text-sm font-bold", col.headerClass)}>
              {col.title}
              <span className="rounded-full bg-black/20 px-2.5 py-0.5 text-xs font-bold tabular-nums text-inherit">
                {itemsInColumn(col.statuses).length}
              </span>
            </h2>
            <div className="max-h-[min(68vh,820px)] overflow-y-auto p-2">
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {itemsInColumn(col.statuses).map((item) => (
                  <KitchenCard
                    key={item.itemId}
                    item={item}
                    canUpdate={!!canUpdate}
                    busyId={busyId}
                    onAdvance={advance}
                    onPickup={pickup}
                  />
                ))}
              </div>
              {itemsInColumn(col.statuses).length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500 dark:text-zinc-600">Nenhum item</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
