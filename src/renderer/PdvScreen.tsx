import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  apiListCustomers,
  apiPdvAddItem,
  apiPdvCloseOrder,
  apiPdvCreateOrder,
  apiPdvOrder,
  apiPdvOrders,
  apiPdvPatchOrder,
  apiPdvProducts,
  apiPdvRemoveItem,
  apiPdvUpdateItemQty,
  type CustomerRow,
  type PdvOrder,
  type PdvProduct,
} from "./api";
import { useAuth } from "./AuthContext";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function kitchenStatusLabel(status: string | null): string | null {
  if (!status) {
    return null;
  }
  const m: Record<string, string> = {
    PENDING: "Cozinha: pendente",
    QUEUE: "Cozinha: na fila",
    PREPARING: "Cozinha: preparando",
    READY: "Cozinha: pronto",
  };
  return m[status] ?? status;
}

type Step = "menu" | "selling";

export function PdvScreen({ onBack }: { onBack: () => void }) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const accessClients = state.status === "authenticated" && state.user.access.clients;

  const [step, setStep] = useState<Step>("menu");
  const [order, setOrder] = useState<PdvOrder | null>(null);
  const [products, setProducts] = useState<PdvProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [openComandas, setOpenComandas] = useState<PdvOrder[]>([]);
  const [filter, setFilter] = useState("");
  const [comandaName, setComandaName] = useState("");
  const [mesaEdit, setMesaEdit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async () => {
    if (!token) {
      return;
    }
    const list = await apiPdvProducts(token);
    setProducts(list);
  }, [token]);

  const loadOpenComandas = useCallback(async () => {
    if (!token) {
      return;
    }
    const list = await apiPdvOrders(token, { status: "OPEN", kind: "COMANDA" });
    setOpenComandas(list);
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadProducts().catch(() => setError("Não foi possível carregar produtos."));
    void loadOpenComandas();
  }, [token, loadProducts, loadOpenComandas]);

  useEffect(() => {
    if (!token || !accessClients) {
      return;
    }
    void apiListCustomers(token)
      .then(setCustomers)
      .catch(() => setCustomers([]));
  }, [token, accessClients]);

  useEffect(() => {
    if (order?.kind === "COMANDA") {
      setMesaEdit(order.clientName ?? "");
    }
  }, [order?.id, order?.kind, order?.clientName]);

  const filteredProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return products;
    }
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, filter]);

  async function startDirect() {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const o = await apiPdvCreateOrder(token, { kind: "DIRECT" });
      setOrder(o);
      setStep("selling");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar venda");
    } finally {
      setBusy(false);
    }
  }

  async function startComanda(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const name = comandaName.trim() || null;
      const o = await apiPdvCreateOrder(token, {
        kind: "COMANDA",
        clientName: name,
        customerId: selectedCustomerId || null,
      });
      setComandaName("");
      setSelectedCustomerId("");
      setOrder(o);
      setStep("selling");
      await loadOpenComandas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar comanda");
    } finally {
      setBusy(false);
    }
  }

  async function resumeComanda(o: PdvOrder) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fresh = await apiPdvOrder(token, o.id);
      setOrder(fresh);
      setStep("selling");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao abrir comanda");
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(p: PdvProduct) {
    if (!token || !order) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvAddItem(token, order.id, p.id, 1);
      setOrder(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setBusy(false);
    }
  }

  async function changeQty(itemId: string, qty: number) {
    if (!token || !order || qty <= 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvUpdateItemQty(token, order.id, itemId, qty);
      setOrder(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!token || !order) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvRemoveItem(token, order.id, itemId);
      setOrder(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!token || !order) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPdvCloseOrder(token, order.id);
      setOrder(null);
      setStep("menu");
      await loadOpenComandas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao finalizar");
    } finally {
      setBusy(false);
    }
  }

  function leaveSelling() {
    setOrder(null);
    setStep("menu");
    void loadOpenComandas();
  }

  if (!token) {
    return null;
  }

  if (step === "selling" && order) {
    return (
      <div className="pdv-layout">
        <header className="pdv-toolbar">
          <button type="button" className="btn-ghost" onClick={leaveSelling} disabled={busy}>
            ← Menu PDV
          </button>
          <div className="pdv-toolbar-title">
            <h1 className="users-title">
              {order.kind === "DIRECT" ? "Venda direta" : "Comanda"}
              {order.kind === "COMANDA" && order.customer
                ? ` — ${order.customer.name}`
                : order.clientName
                  ? ` — ${order.clientName}`
                  : null}
            </h1>
            <p className="pdv-sub">Pedido #{order.id.slice(0, 8)} · {order.status}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onBack}>
            Hub
          </button>
        </header>
        {error ? <p className="users-error pdv-banner">{error}</p> : null}
        {order.kind === "COMANDA" && accessClients ? (
          <div className="pdv-customer-bar">
            <label className="pdv-customer-field">
              <span>Cliente cadastrado</span>
              <select
                value={order.customerId ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value;
                  void (async () => {
                    if (!token) {
                      return;
                    }
                    setBusy(true);
                    try {
                      const next = await apiPdvPatchOrder(token, order.id, {
                        customerId: v || null,
                      });
                      setOrder(next);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Erro ao vincular cliente");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <option value="">— Sem vínculo (só mesa/nome) —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pdv-customer-field">
              <span>Mesa / observação</span>
              <input
                value={mesaEdit}
                onChange={(e) => setMesaEdit(e.target.value)}
                disabled={busy}
                onBlur={() => {
                  void (async () => {
                    if (!token) {
                      return;
                    }
                    const v = mesaEdit.trim() || null;
                    const prev = order.clientName ?? null;
                    if (v === prev) {
                      return;
                    }
                    setBusy(true);
                    try {
                      const next = await apiPdvPatchOrder(token, order.id, { clientName: v });
                      setOrder(next);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Erro ao salvar");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              />
            </label>
          </div>
        ) : null}
        <div className="pdv-split">
          <section className="pdv-panel">
            <input
              type="search"
              className="pdv-search"
              placeholder="Buscar produto…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="pdv-product-grid">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pdv-product-card"
                  onClick={() => void addProduct(p)}
                  disabled={busy}
                >
                  <span className="pdv-product-name">{p.name}</span>
                  <span className="pdv-product-meta">
                    {money.format(p.price)} · {p.productType === "GELADO" ? "Gelado" : "Quente"}
                    {p.isKitchenItem ? " · Cozinha" : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
          <aside className="pdv-cart">
            <h2 className="pdv-cart-title">Itens</h2>
            {order.items.length === 0 ? (
              <p className="cash-muted">Nenhum item. Toque em um produto à esquerda.</p>
            ) : (
              <ul className="pdv-cart-list">
                {order.items.map((i) => (
                  <li key={i.id} className="pdv-cart-line">
                    <div>
                      <strong>{i.productName}</strong>
                      {i.isKitchenItem && i.kitchenStatus ? (
                        <span className="pdv-kitchen-badge">{kitchenStatusLabel(i.kitchenStatus)}</span>
                      ) : null}
                      <div className="pdv-cart-line-price">
                        {money.format(i.unitPrice)} ×{" "}
                        <span className="pdv-qty-controls">
                          <button
                            type="button"
                            className="pdv-qty-btn"
                            disabled={busy || i.quantity <= 1}
                            onClick={() => {
                              if (i.quantity <= 1) {
                                void removeItem(i.id);
                              } else {
                                void changeQty(i.id, i.quantity - 1);
                              }
                            }}
                          >
                            −
                          </button>
                          <span className="pdv-qty-val">{i.quantity}</span>
                          <button
                            type="button"
                            className="pdv-qty-btn"
                            disabled={busy}
                            onClick={() => void changeQty(i.id, i.quantity + 1)}
                          >
                            +
                          </button>
                        </span>{" "}
                        = {money.format(i.lineTotal)}
                      </div>
                    </div>
                    <button type="button" className="btn-link danger" onClick={() => void removeItem(i.id)} disabled={busy}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="pdv-total">
              <span>Subtotal</span>
              <strong>{money.format(order.subtotal)}</strong>
            </div>
            <button type="button" className="btn-primary pdv-finalize" onClick={() => void finalize()} disabled={busy}>
              {order.kind === "DIRECT" ? "Finalizar venda" : "Encerrar comanda"}
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="pdv-layout">
      <header className="pdv-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h1 className="users-title pdv-main-title">PDV — Nova venda</h1>
        <span />
      </header>
      <div className="pdv-menu">
        {error ? <p className="users-error">{error}</p> : null}
        <div className="pdv-menu-grid">
          <button type="button" className="pdv-mode-card" onClick={() => void startDirect()} disabled={busy}>
            <h2>Venda direta</h2>
            <p>Balcão, sem cliente obrigatório. Inicia um pedido e finalize ao concluir.</p>
          </button>
          <div className="pdv-mode-card pdv-comanda-card">
            <h2>Comanda</h2>
            <p>Cliente cadastrado (relatório) ou só mesa/nome rápido.</p>
            <form onSubmit={(e) => void startComanda(e)} className="pdv-comanda-form">
              {accessClients ? (
                <label className="field">
                  <span>Cliente (faturamento)</span>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    disabled={busy}
                  >
                    <option value="">— Não usar cadastro —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <input
                type="text"
                placeholder="Mesa / apelido (opcional)"
                value={comandaName}
                onChange={(e) => setComandaName(e.target.value)}
                disabled={busy}
              />
              <button type="submit" className="btn-primary" disabled={busy}>
                Abrir comanda
              </button>
            </form>
          </div>
        </div>
        <section className="pdv-open-comandas">
          <h3>Comandas abertas</h3>
          {openComandas.length === 0 ? (
            <p className="cash-muted">Nenhuma comanda aberta.</p>
          ) : (
            <ul className="pdv-comanda-chips">
              {openComandas.map((o) => (
                <li key={o.id}>
                  <button type="button" className="pdv-chip" onClick={() => void resumeComanda(o)} disabled={busy}>
                    {o.customer?.name ?? o.clientName ?? "Sem nome"} · {money.format(o.subtotal)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
