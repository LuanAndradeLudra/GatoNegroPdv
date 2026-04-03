import { useCallback, useEffect, useState } from "react";
import { apiKitchenBoard, apiKitchenSetStatus, type KitchenBoardItem } from "./api";
import { useAuth } from "./AuthContext";

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

export function KitchenScreen({ onBack }: { onBack: () => void }) {
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
    <div className="kitchen-layout">
      <header className="kitchen-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <div className="kitchen-toolbar-center">
          <h1 className="users-title">Cozinha</h1>
          <p className="kitchen-sync">
            Pedidos do PDV aparecem automaticamente na fila ·{" "}
            {lastSync ? `sync ${new Date(lastSync).toLocaleTimeString("pt-BR")}` : "…"} · a cada 3s
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={!!busyId}>
          Atualizar
        </button>
      </header>

      {error ? <p className="users-error kitchen-banner">{error}</p> : null}

      {!canUpdate ? (
        <p className="kitchen-readonly">Somente visualização — sem permissão para alterar status.</p>
      ) : null}

      <div className="kitchen-board">
        {BOARD_COLUMNS.map((col) => (
          <section key={col.title} className="kitchen-column">
            <h2 className="kitchen-column-title">
              {col.title}
              <span className="kitchen-count">{itemsInColumn(col.statuses).length}</span>
            </h2>
            <div className="kitchen-cards">
              {itemsInColumn(col.statuses).map((item) => (
                <article key={item.itemId} className="kitchen-card">
                  <header className="kitchen-card-head">
                    <span className="kitchen-order-tag">{orderLabel(item.orderKind, item.clientName)}</span>
                    <span className="kitchen-wait" title="Tempo desde a abertura do pedido">
                      {item.minutesWaiting} min
                    </span>
                  </header>
                  <p className="kitchen-product">
                    <strong>{item.productName}</strong>
                    <span className="kitchen-qty">× {item.quantity}</span>
                  </p>
                  {canUpdate ? (
                    <div className="kitchen-actions">
                      {item.kitchenStatus === "QUEUE" || item.kitchenStatus === "PENDING" ? (
                        <button
                          type="button"
                          className="btn-primary btn-small"
                          disabled={busyId === item.itemId}
                          onClick={() => void advance(item, "PREPARING")}
                        >
                          Preparar
                        </button>
                      ) : null}
                      {item.kitchenStatus === "PREPARING" ? (
                        <button
                          type="button"
                          className="btn-primary btn-small"
                          disabled={busyId === item.itemId}
                          onClick={() => void advance(item, "READY")}
                        >
                          Pronto
                        </button>
                      ) : null}
                      {item.kitchenStatus === "READY" ? (
                        <span className="kitchen-done">Aguardando retirada / servir</span>
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
