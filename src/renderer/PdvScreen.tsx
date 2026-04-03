import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import {
  apiListCustomers,
  apiListPaymentMethods,
  apiPdvAddItem,
  apiPdvCancelOrder,
  apiPdvCloseOrder,
  apiPdvCreateOrder,
  apiPdvOrder,
  apiPdvOrders,
  apiPdvPatchOrder,
  apiPdvProducts,
  apiPdvReopenOrder,
  apiPdvRemoveItem,
  apiPdvUpdateItemQty,
  pdvStockStreamUrl,
  type CustomerRow,
  type PdvOrder,
  type PdvProduct,
  type PaymentMethodRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { CheckoutModal, type CheckoutPaymentLine } from "./components/CheckoutModal";
import { ClosedOrderReportModal } from "./components/ClosedOrderReportModal";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function qtyInOrder(ord: PdvOrder, productId: string): number {
  return ord.items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);
}

function triggerShake(setter: (id: string | null) => void, productId: string): void {
  setter(productId);
  window.setTimeout(() => setter(null), 450);
}

function stockLineClass(p: PdvProduct): string {
  if (!p.controlsStock) {
    return "text-[10px] leading-snug text-zinc-500";
  }
  if (p.minStock > 0 && p.stock <= p.minStock) {
    return "text-[10px] leading-snug font-semibold text-red-400";
  }
  if (p.stock < 5) {
    return "text-[10px] leading-snug font-medium text-orange-400/95";
  }
  return "text-[10px] leading-snug text-zinc-500";
}

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
type SaleMode = "direct" | "comanda";

export type PdvBootPayload = { mode: "direct" | "comanda"; id: number };

export function PdvScreen({
  boot,
  onBootConsumed,
}: {
  boot?: PdvBootPayload | null;
  onBootConsumed?: () => void;
}) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const accessClients = state.status === "authenticated" && state.user.access.clients;

  const [step, setStep] = useState<Step>("menu");
  const [saleMode, setSaleMode] = useState<SaleMode>("direct");
  const [order, setOrder] = useState<PdvOrder | null>(null);
  const [products, setProducts] = useState<PdvProduct[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [openComandas, setOpenComandas] = useState<PdvOrder[]>([]);
  const [comandaSearch, setComandaSearch] = useState("");
  const [recentClosed, setRecentClosed] = useState<PdvOrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [reportOrderId, setReportOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [comandaName, setComandaName] = useState("");
  const [mesaEdit, setMesaEdit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shakeProductId, setShakeProductId] = useState<string | null>(null);
  const [cancelKitchenModal, setCancelKitchenModal] = useState<{
    orderId: string;
    restoreStock: boolean;
    lines: { id: string; productName: string; quantity: number }[];
    choices: Record<string, "return" | "waste">;
  } | null>(null);

  const loadProducts = useCallback(async () => {
    if (!token) {
      return;
    }
    const orderId = step === "selling" && order ? order.id : undefined;
    const list = await apiPdvProducts(token, orderId);
    setProducts(list);
  }, [token, step, order?.id]);

  const loadOpenComandas = useCallback(async () => {
    if (!token) {
      return;
    }
    const search = comandaSearch.trim() || undefined;
    const list = await apiPdvOrders(token, {
      status: "OPEN",
      kind: "COMANDA",
      sort: "stale",
      search,
    });
    setOpenComandas(list);
  }, [token, comandaSearch]);

  const loadRecentClosed = useCallback(async () => {
    if (!token) {
      return;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const list = await apiPdvOrders(token, {
      status: "CLOSED",
      sort: "recentClosed",
      limit: 14,
      closedFrom: start.toISOString(),
    });
    setRecentClosed(list);
  }, [token]);

  const loadPaymentMethods = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const list = await apiListPaymentMethods(token, false);
      setPaymentMethods(list);
    } catch {
      setPaymentMethods([]);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadProducts().catch(() => setError("Não foi possível carregar produtos."));
    void loadPaymentMethods();
  }, [token, loadProducts, loadPaymentMethods]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const url = pdvStockStreamUrl(token);
    const es = new EventSource(url);
    es.addEventListener("message", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data as string) as { type?: string };
        if (data.type === "stock") {
          void loadProducts().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("error", () => {
      /* reconexão automática do EventSource */
    });
    return () => {
      es.close();
    };
  }, [token, loadProducts]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadOpenComandas();
  }, [token, loadOpenComandas]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRecentClosed();
  }, [token, loadRecentClosed]);

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

  useEffect(() => {
    if (!boot) {
      return;
    }
    setSaleMode(boot.mode);
    onBootConsumed?.();
  }, [boot, onBootConsumed]);

  const filteredProducts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return products;
    }
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, filter]);

  const openComandasTotal = useMemo(
    () => Math.round(openComandas.reduce((s, o) => s + o.subtotal, 0) * 100) / 100,
    [openComandas],
  );

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
      await loadRecentClosed();
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
    const oid = order.id;
    const inCart = order.items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.quantity, 0);
    const cap = p.controlsStock && p.availableForOrder != null ? p.availableForOrder : null;
    if (cap != null && inCart + 1 > cap + 1e-6) {
      triggerShake(setShakeProductId, p.id);
      setError(`Limite de estoque para "${p.name}". Máximo neste pedido: ${cap} un.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvAddItem(token, oid, p.id, 1);
      setOrder(next);
      const list = await apiPdvProducts(token, oid);
      setProducts(list);
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
    const oid = order.id;
    const line = order.items.find((i) => i.id === itemId);
    if (line?.maxQuantity != null && qty > line.maxQuantity + 1e-6) {
      setError(`Quantidade máxima para "${line.productName}": ${line.maxQuantity} un.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvUpdateItemQty(token, oid, itemId, qty);
      setOrder(next);
      const list = await apiPdvProducts(token, oid);
      setProducts(list);
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
    const oid = order.id;
    setBusy(true);
    setError(null);
    try {
      const next = await apiPdvRemoveItem(token, oid, itemId);
      setOrder(next);
      const list = await apiPdvProducts(token, oid);
      setProducts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  function openCheckout() {
    if (!order) {
      return;
    }
    setError(null);
    setCheckoutOpen(true);
  }

  async function confirmCheckout(payments: CheckoutPaymentLine[]) {
    if (!token || !order) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPdvCloseOrder(
        token,
        order.id,
        payments.map((p) => ({
          paymentMethodId: p.paymentMethodId,
          amountPaid: p.amountPaid,
          cashReceived: p.cashReceived,
        })),
      );
      setCheckoutOpen(false);
      setOrder(null);
      setStep("menu");
      await loadOpenComandas();
      await loadRecentClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao finalizar");
    } finally {
      setBusy(false);
    }
  }

  async function reopenSale(o: PdvOrder) {
    if (!token) {
      return;
    }
    if (!window.confirm("Reabrir esta venda? Os lançamentos de pagamento serão excluídos e o pedido voltará a aberto.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPdvReopenOrder(token, o.id);
      await loadRecentClosed();
      await loadOpenComandas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reabrir");
    } finally {
      setBusy(false);
    }
  }

  async function runCancel(
    orderId: string,
    restoreStock: boolean,
    kitchenItemRestore?: Record<string, "return" | "waste">,
  ) {
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPdvCancelOrder(token, orderId, { restoreStock, kitchenItemRestore });
      setCancelKitchenModal(null);
      await loadRecentClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao estornar");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale(o: PdvOrder) {
    if (!token) {
      return;
    }
    if (!window.confirm("Estornar esta venda? Ela será marcada como cancelada.")) {
      return;
    }
    let restoreStock = false;
    if (o.status === "CLOSED") {
      restoreStock = window.confirm("Deseja retornar os itens ao estoque?\n\nOK = Sim\nCancelar = Não");
      if (restoreStock) {
        const kitchenLines = o.items.filter((i) => i.isKitchenItem && i.controlsStock);
        if (kitchenLines.length > 0) {
          setCancelKitchenModal({
            orderId: o.id,
            restoreStock: true,
            lines: kitchenLines.map((i) => ({
              id: i.id,
              productName: i.productName,
              quantity: i.quantity,
            })),
            choices: Object.fromEntries(kitchenLines.map((i) => [i.id, "return" as const])),
          });
          return;
        }
      }
    }
    await runCancel(o.id, restoreStock);
  }

  function leaveSelling() {
    setOrder(null);
    setStep("menu");
    void loadOpenComandas();
  }

  if (!token) {
    return null;
  }

  const cartPanel = (
    <aside className="flex w-full flex-col border-t border-white/[0.08] bg-[#161616]/95 backdrop-blur-md lg:w-[min(420px,40vw)] lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-200">Resumo</h2>
        {order && step === "selling" ? (
          <span className="text-[11px] text-zinc-500">#{order.id.slice(0, 8)}</span>
        ) : null}
      </div>
      <div className="flex min-h-[200px] flex-1 flex-col overflow-auto px-4 py-3">
        {!order || step !== "selling" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="rounded-full bg-white/[0.06] p-4 ring-1 ring-white/[0.08]">
              <ShoppingBag className="h-8 w-8 text-zinc-500" strokeWidth={1.25} />
            </div>
            <p className="max-w-[240px] text-sm text-zinc-500">
              Inicie uma venda direta ou uma comanda para montar o pedido aqui.
            </p>
            <p className="text-2xl font-semibold tabular-nums text-zinc-600">{money.format(0)}</p>
          </div>
        ) : order.items.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum item. Toque em um produto à esquerda.</p>
        ) : (
          <ul className="space-y-0 divide-y divide-white/[0.06]">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <strong className="text-sm text-zinc-100">{i.productName}</strong>
                  {i.isKitchenItem && i.kitchenStatus ? (
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-500/90">
                      {kitchenStatusLabel(i.kitchenStatus)}
                    </span>
                  ) : null}
                  {i.controlsStock && i.maxQuantity != null ? (
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      Estoque (máx. neste pedido): {i.maxQuantity}
                      {i.stockPhysical != null ? ` · Físico ${i.stockPhysical}` : ""}
                      {i.reservedElsewhere != null && i.reservedElsewhere > 0
                        ? ` · Outras comandas: ${i.reservedElsewhere}`
                        : ""}
                    </span>
                  ) : null}
                  <div className="mt-1 text-xs text-zinc-500">
                    {money.format(i.unitPrice)} ×{" "}
                    <span className="inline-flex items-center gap-1 align-middle">
                      <button
                        type="button"
                        className="rounded border border-white/15 bg-zinc-900 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800"
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
                      <span className="min-w-[1.5rem] text-center">{i.quantity}</span>
                      <button
                        type="button"
                        className={cn(
                          "rounded border border-white/15 bg-zinc-900 px-1.5 py-0.5 text-zinc-300 hover:bg-zinc-800",
                          i.controlsStock &&
                            i.maxQuantity != null &&
                            i.quantity >= i.maxQuantity - 1e-6 &&
                            "opacity-50",
                        )}
                        disabled={busy}
                        title={
                          i.controlsStock && i.maxQuantity != null && i.quantity >= i.maxQuantity - 1e-6
                            ? "Limite de estoque para este pedido"
                            : undefined
                        }
                        onClick={() => {
                          const atMax =
                            i.controlsStock &&
                            i.maxQuantity != null &&
                            i.quantity >= i.maxQuantity - 1e-6;
                          if (atMax) {
                            triggerShake(setShakeProductId, i.productId);
                            setError(`Limite de estoque para "${i.productName}" neste pedido.`);
                            return;
                          }
                          void changeQty(i.id, i.quantity + 1);
                        }}
                      >
                        +
                      </button>
                    </span>{" "}
                    = {money.format(i.lineTotal)}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-zinc-500 hover:text-red-400"
                  onClick={() => void removeItem(i.id)}
                  disabled={busy}
                  aria-label="Remover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-white/[0.08] bg-[#141414]/80 px-4 py-4">
        {order && step === "selling" ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-zinc-500">Total</span>
              <span className="text-2xl font-bold tabular-nums text-amber-200/95">{money.format(order.subtotal)}</span>
            </div>
            <Button type="button" className="mt-4 w-full" disabled={busy} onClick={openCheckout}>
              {order.kind === "DIRECT" ? "Finalizar venda" : "Encerrar comanda"}
            </Button>
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-2 opacity-50">
            <span className="text-sm text-zinc-500">Total</span>
            <span className="text-xl font-semibold tabular-nums text-zinc-600">{money.format(0)}</span>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {step === "selling" && order ? (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-4 py-2">
            <Button type="button" variant="ghost" className="!px-2 text-sm" onClick={leaveSelling} disabled={busy}>
              ← Voltar ao menu
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-zinc-100">
                {order.kind === "DIRECT" ? "Venda direta" : "Comanda"}
                {order.kind === "COMANDA" && order.customer
                  ? ` — ${order.customer.name}`
                  : order.clientName
                    ? ` — ${order.clientName}`
                    : null}
              </h2>
              <p className="text-[11px] text-zinc-500">
                Pedido #{order.id.slice(0, 8)} · {order.status}
              </p>
            </div>
          </div>
          {error ? <p className="border-b border-red-500/20 bg-red-950/30 px-4 py-2 text-sm text-red-300">{error}</p> : null}
          {order.kind === "COMANDA" && accessClients ? (
            <div className="flex flex-wrap gap-3 border-b border-white/[0.06] bg-[#161616]/50 px-4 py-3">
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] text-zinc-500">
                Cliente cadastrado
                <select
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
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
              <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[11px] text-zinc-500">
                Mesa / observação
                <input
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
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
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
            <input
              type="search"
              className="mb-3 w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
              placeholder="Buscar produto…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {filteredProducts.map((p) => {
                const inCart = order ? qtyInOrder(order, p.id) : 0;
                const cap = p.controlsStock && p.availableForOrder != null ? p.availableForOrder : null;
                const remaining =
                  cap != null ? Math.max(0, Math.round((cap - inCart) * 1000) / 1000) : null;
                const atCap = cap != null && inCart >= cap - 1e-6;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-lg border border-white/[0.08] bg-[#1e1e1e]/80 p-3 text-left text-sm transition-colors hover:border-amber-500/30 hover:bg-[#222]",
                      atCap && "opacity-55 hover:border-white/[0.08] hover:bg-[#1e1e1e]/80",
                      shakeProductId === p.id && "gn-shake",
                    )}
                    onClick={() => void addProduct(p)}
                    disabled={busy}
                    title={atCap ? "Sem quantidade disponível para este pedido (estoque ou reserva em outras comandas)" : undefined}
                  >
                    <span className="font-medium text-zinc-100">{p.name}</span>
                    <span className="text-[11px] text-zinc-500">
                      {money.format(p.price)}
                      {p.isKitchenItem ? " · Cozinha" : ""}
                    </span>
                    {p.controlsStock ? (
                      <span
                        className={cn(
                          "inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-md px-1.5 py-0.5 ring-1 ring-inset",
                          p.minStock > 0 && p.stock <= p.minStock
                            ? "bg-red-950/50 ring-red-500/35"
                            : p.stock < 5
                              ? "bg-orange-950/40 ring-orange-500/30"
                              : "bg-white/[0.04] ring-white/[0.08]",
                        )}
                      >
                        <span className={stockLineClass(p)}>
                          Físico: {p.stock}
                          {cap != null ? ` · Máx. este pedido: ${cap}` : ""}
                          {remaining != null ? ` · Falta lançar: ${remaining}` : ""}
                        </span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {cartPanel}
      </div>
      ) : (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-white/[0.08] lg:border-b-0 lg:border-r">
        {error ? <p className="border-b border-red-500/20 bg-red-950/30 px-4 py-2 text-sm text-red-300">{error}</p> : null}
        <div className="space-y-4 border-b border-white/[0.06] p-4">
          <div className="flex rounded-lg bg-zinc-900/60 p-1 ring-1 ring-white/[0.08]">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
                saleMode === "direct" ? "bg-[#2a2a2a] text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300",
              )}
              onClick={() => setSaleMode("direct")}
            >
              Venda direta
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md py-2 text-sm font-medium transition-colors",
                saleMode === "comanda" ? "bg-[#2a2a2a] text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300",
              )}
              onClick={() => setSaleMode("comanda")}
            >
              Comanda
            </button>
          </div>

          {saleMode === "direct" ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-500">Balcão, sem cliente obrigatório. Ideal para vendas rápidas.</p>
              <Button type="button" className="w-full sm:w-auto" disabled={busy} onClick={() => void startDirect()}>
                Iniciar venda no balcão
              </Button>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={(e) => void startComanda(e)}>
              {accessClients ? (
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Cliente (faturamento)
                  <select
                    className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
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
              <Input
                label="Mesa / apelido (opcional)"
                placeholder="Ex.: Mesa 4"
                value={comandaName}
                onChange={(e) => setComandaName(e.target.value)}
                disabled={busy}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Abrir comanda
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => void startDirect()}>
                  Prefiro venda direta
                </Button>
              </div>
            </form>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#181818]/80 px-4 py-3">
            <p className="text-sm text-zinc-300">
              <span className="font-semibold text-amber-200/90">{openComandas.length}</span> comandas abertas
              <span className="mx-2 text-zinc-600">|</span>
              Total em aberto:{" "}
              <span className="font-semibold tabular-nums text-zinc-100">{money.format(openComandasTotal)}</span>
            </p>
          </div>
          <Input
            label="Buscar mesa ou cliente"
            placeholder="Filtrar lista…"
            value={comandaSearch}
            onChange={(e) => setComandaSearch(e.target.value)}
            disabled={busy}
          />
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Comandas abertas</h3>
            {openComandas.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhuma comanda aberta.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {openComandas.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      className="rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-amber-500/40"
                      onClick={() => void resumeComanda(o)}
                      disabled={busy}
                    >
                      {o.customer?.name ?? o.clientName ?? "Sem nome"} · {money.format(o.subtotal)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Encerradas hoje</h3>
            {recentClosed.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhuma venda fechada hoje.</p>
            ) : (
              <ul className="space-y-2">
                {recentClosed.map((o) => (
                  <li
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#1a1a1a]/60 px-3 py-2 text-xs"
                  >
                    <span className="text-zinc-400">
                      {o.kind === "DIRECT" ? "Balcão" : "Comanda"}{" "}
                      {o.customer?.name ?? o.clientName ?? "—"} · {money.format(o.subtotal)}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="!py-0.5 !text-[11px]"
                        disabled={busy}
                        onClick={() => setReportOrderId(o.id)}
                      >
                        Relatório
                      </Button>
                      {o.canReopen ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="!py-0.5 !text-[11px]"
                          disabled={busy}
                          onClick={() => void reopenSale(o)}
                        >
                          Reabrir
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="danger"
                        className="!py-0.5 !text-[11px]"
                        disabled={busy}
                        onClick={() => void cancelSale(o)}
                      >
                        Estornar
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      {cartPanel}
    </div>
      )}
      {cancelKitchenModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a1a] p-5 shadow-xl">
            <h3 className="text-base font-semibold text-zinc-100">Itens de cozinha no estorno</h3>
            <p className="mt-2 text-sm text-zinc-500">
              Para cada item, informe se houve desperdício (não volta ao estoque físico) ou se pode devolver ao estoque.
            </p>
            <ul className="mt-4 max-h-[50vh] space-y-3 overflow-auto">
              {cancelKitchenModal.lines.map((ln) => (
                <li key={ln.id} className="rounded-lg border border-white/[0.06] bg-[#141414] px-3 py-2">
                  <p className="text-sm text-zinc-200">
                    {ln.productName}{" "}
                    <span className="text-zinc-500">
                      × {ln.quantity}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300">
                      <input
                        type="radio"
                        name={`kr-${ln.id}`}
                        checked={cancelKitchenModal.choices[ln.id] === "return"}
                        onChange={() =>
                          setCancelKitchenModal((m) =>
                            m
                              ? {
                                  ...m,
                                  choices: { ...m.choices, [ln.id]: "return" },
                                }
                              : m,
                          )
                        }
                      />
                      Volta ao estoque
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-zinc-300">
                      <input
                        type="radio"
                        name={`kr-${ln.id}`}
                        checked={cancelKitchenModal.choices[ln.id] === "waste"}
                        onChange={() =>
                          setCancelKitchenModal((m) =>
                            m
                              ? {
                                  ...m,
                                  choices: { ...m.choices, [ln.id]: "waste" },
                                }
                              : m,
                          )
                        }
                      />
                      Desperdício
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setCancelKitchenModal(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy}
                onClick={() =>
                  void runCancel(cancelKitchenModal.orderId, cancelKitchenModal.restoreStock, cancelKitchenModal.choices)
                }
              >
                Confirmar estorno
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <CheckoutModal
        open={checkoutOpen}
        subtotal={order?.subtotal ?? 0}
        methods={paymentMethods}
        busy={busy}
        onClose={() => setCheckoutOpen(false)}
        onConfirm={(p) => void confirmCheckout(p)}
      />
      <ClosedOrderReportModal
        open={reportOrderId !== null}
        orderId={reportOrderId}
        token={token}
        onClose={() => setReportOrderId(null)}
      />
    </>
  );
}
