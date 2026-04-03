import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiStockCreateMovement,
  apiStockCreateProduct,
  apiStockDeleteProduct,
  apiStockMovements,
  apiStockPatchProduct,
  apiStockProducts,
  type ErpProductRow,
  type StockMovementRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { formatDigitsAsBRL, parseDigitsToReais, reaisToDigits } from "./lib/moneyInput";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function hasAnyStockAccess(s: { produtos: boolean; entrada: boolean; saida: boolean; ajuste: boolean }): boolean {
  return s.produtos || s.entrada || s.saida || s.ajuste;
}

type Tab = "produtos" | "movimentos";

export function ErpStockScreen() {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const stock =
    state.status === "authenticated"
      ? (state.user.access.stock ?? { produtos: false, entrada: false, saida: false, ajuste: false })
      : null;

  const [tab, setTab] = useState<Tab>("produtos");
  const [products, setProducts] = useState<ErpProductRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [historyFilter, setHistoryFilter] = useState("");

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ErpProductRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formPriceDigits, setFormPriceDigits] = useState("");
  const [formKitchen, setFormKitchen] = useState(false);
  const [formControls, setFormControls] = useState(true);
  const [formActive, setFormActive] = useState(true);
  const [formInitialStock, setFormInitialStock] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);

  const [movProductId, setMovProductId] = useState("");
  const [movProductSearch, setMovProductSearch] = useState("");
  const [movPickerOpen, setMovPickerOpen] = useState(false);
  const movPickerRef = useRef<HTMLDivElement>(null);
  const [movKind, setMovKind] = useState<"ENTRADA" | "SAIDA" | "AJUSTE">("ENTRADA");
  const [movQty, setMovQty] = useState("");
  const [movNewStock, setMovNewStock] = useState("");
  const [movNote, setMovNote] = useState("");
  const [movErr, setMovErr] = useState<string | null>(null);

  const canProducts = stock?.produtos ?? false;
  const canEntrada = stock?.entrada ?? false;
  const canSaida = stock?.saida ?? false;
  const canAjuste = stock?.ajuste ?? false;
  const canMove = canEntrada || canSaida || canAjuste;

  const loadProducts = useCallback(async () => {
    if (!token) {
      return;
    }
    const list = await apiStockProducts(token);
    setProducts(list);
  }, [token]);

  const loadMovements = useCallback(async () => {
    if (!token) {
      return;
    }
    const list = await apiStockMovements(token, { take: 200 });
    setMovements(list);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token || !stock || !hasAnyStockAccess(stock)) {
      return;
    }
    setLoadErr(null);
    try {
      await Promise.all([loadProducts(), loadMovements()]);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [token, stock, loadProducts, loadMovements]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!stock) {
      return;
    }
    if (!hasAnyStockAccess(stock)) {
      return;
    }
    if (tab === "produtos" && !canProducts && canMove) {
      setTab("movimentos");
    }
    if (tab === "movimentos" && !canMove && canProducts) {
      setTab("produtos");
    }
  }, [stock, tab, canProducts, canMove]);

  const productOptions = useMemo(() => products.filter((p) => p.controlsStock), [products]);

  const movPickFiltered = useMemo(() => {
    const q = movProductSearch.trim().toLowerCase();
    if (!q) {
      return productOptions.slice(0, 80);
    }
    return productOptions.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 80);
  }, [productOptions, movProductSearch]);

  const movementsFiltered = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) {
      return movements;
    }
    return movements.filter((m) => m.product.name.toLowerCase().includes(q));
  }, [movements, historyFilter]);

  const kindOptions = useMemo(
    () =>
      [
        { value: "ENTRADA" as const, label: "Entrada (compra / reposição)", ok: canEntrada },
        { value: "SAIDA" as const, label: "Saída (perda / uso)", ok: canSaida },
        { value: "AJUSTE" as const, label: "Ajuste (inventário)", ok: canAjuste },
      ].filter((o) => o.ok),
    [canEntrada, canSaida, canAjuste],
  );

  useEffect(() => {
    if (kindOptions.length === 0) {
      return;
    }
    if (!kindOptions.some((o) => o.value === movKind)) {
      setMovKind(kindOptions[0].value);
    }
  }, [kindOptions, movKind]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!movPickerRef.current?.contains(e.target as Node)) {
        setMovPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  function openCreate() {
    setModal("create");
    setEditing(null);
    setFormName("");
    setFormPriceDigits("");
    setFormKitchen(false);
    setFormControls(true);
    setFormActive(true);
    setFormInitialStock("0");
    setFormErr(null);
  }

  function openEdit(p: ErpProductRow) {
    setModal("edit");
    setEditing(p);
    setFormName(p.name);
    setFormPriceDigits(reaisToDigits(p.price));
    setFormKitchen(p.isKitchenItem);
    setFormControls(p.controlsStock);
    setFormActive(p.active);
    setFormErr(null);
  }

  function closeModal() {
    setModal(null);
    setEditing(null);
  }

  async function onDeleteProduct(p: ErpProductRow) {
    if (!token || !canProducts) {
      return;
    }
    if (!window.confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setBusy(true);
    setLoadErr(null);
    try {
      await apiStockDeleteProduct(token, p.id);
      await refresh();
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitProduct(e: FormEvent) {
    e.preventDefault();
    if (!token || !canProducts) {
      return;
    }
    setBusy(true);
    setFormErr(null);
    try {
      const price = parseDigitsToReais(formPriceDigits);
      if (price == null || price < 0) {
        setFormErr("Informe um preço válido.");
        return;
      }
      if (modal === "create") {
        const initial = Number.parseFloat(formInitialStock.replace(",", ".")) || 0;
        await apiStockCreateProduct(token, {
          name: formName.trim(),
          price,
          isKitchenItem: formKitchen,
          controlsStock: formControls,
          active: formActive,
          initialStock: initial,
        });
      } else if (editing) {
        await apiStockPatchProduct(token, editing.id, {
          name: formName.trim(),
          price,
          isKitchenItem: formKitchen,
          controlsStock: formControls,
          active: formActive,
        });
      }
      closeModal();
      await refresh();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitMovement(e: FormEvent) {
    e.preventDefault();
    if (!token || !movProductId) {
      setMovErr("Selecione o produto.");
      return;
    }
    setBusy(true);
    setMovErr(null);
    try {
      const body: Parameters<typeof apiStockCreateMovement>[1] = {
        kind: movKind,
        productId: movProductId,
        note: movNote.trim() || null,
      };
      if (movKind === "AJUSTE") {
        body.newStock = Number.parseFloat(movNewStock.replace(",", "."));
      } else {
        body.quantity = Number.parseFloat(movQty.replace(",", "."));
      }
      await apiStockCreateMovement(token, body);
      setMovQty("");
      setMovNewStock("");
      setMovNote("");
      setMovProductId("");
      setMovProductSearch("");
      await refresh();
    } catch (err) {
      setMovErr(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setBusy(false);
    }
  }

  if (!stock || !hasAnyStockAccess(stock)) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12">
        <Card>
          <CardContent className="!py-10 text-center">
            <p className="text-lg font-medium text-zinc-200">Estoque</p>
            <p className="mt-2 text-sm text-zinc-500">
              Seu usuário não tem permissões de estoque (cadastro, entrada, saída ou ajuste). Peça ao administrador para
              liberar no módulo Estoque.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">ERP</p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">Estoque</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Cadastro de produtos, movimentações manuais e histórico. A baixa na venda é automática ao fechar pedidos no PDV
          (produtos com controle de estoque).
        </p>
      </div>

      {loadErr ? <p className="text-sm text-red-400/90">{loadErr}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        {canProducts ? (
          <button
            type="button"
            onClick={() => setTab("produtos")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "produtos" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            Produtos
          </button>
        ) : null}
        {canMove ? (
          <button
            type="button"
            onClick={() => setTab("movimentos")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === "movimentos" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            Movimentações
          </button>
        ) : null}
      </div>

      {tab === "produtos" && canProducts ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={openCreate} disabled={busy}>
              Novo produto
            </Button>
          </div>
          <Card>
            <CardContent className="!p-0">
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Nome</Th>
                      <Th>Preço</Th>
                      <Th>Estoque</Th>
                      <Th>Controle</Th>
                      <Th>Ativo</Th>
                      <Th />
                    </Tr>
                  </THead>
                  <TBody>
                    {products.map((p) => (
                      <Tr key={p.id}>
                        <Td className="font-medium text-zinc-200">{p.name}</Td>
                        <Td className="tabular-nums">{money.format(p.price)}</Td>
                        <Td className="tabular-nums">{p.controlsStock ? p.stock : "—"}</Td>
                        <Td>{p.controlsStock ? "Sim" : "Não"}</Td>
                        <Td>{p.active ? "Sim" : "Não"}</Td>
                        <Td>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="text-sm font-medium text-amber-300/90 hover:text-amber-200"
                              onClick={() => openEdit(p)}
                              disabled={busy}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="text-sm font-medium text-red-400/90 hover:text-red-300"
                              onClick={() => void onDeleteProduct(p)}
                              disabled={busy}
                            >
                              Excluir
                            </button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "movimentos" && canMove ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Card>
            <CardContent className="space-y-4 !p-5">
              <p className="text-sm font-medium text-zinc-200">Registrar movimento</p>
              {kindOptions.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma ação de movimentação liberada.</p>
              ) : (
                <form className="space-y-3" onSubmit={(e) => void onSubmitMovement(e)}>
                  <div ref={movPickerRef} className="relative">
                    <label className="mb-1 block text-[13px] text-zinc-500">Produto</label>
                    <input
                      type="search"
                      autoComplete="off"
                      placeholder="Buscar por nome…"
                      value={movProductSearch}
                      onChange={(e) => {
                        setMovProductSearch(e.target.value);
                        setMovProductId("");
                        setMovPickerOpen(true);
                      }}
                      onFocus={() => setMovPickerOpen(true)}
                      className="w-full rounded-lg border border-white/[0.1] bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/30"
                    />
                    {movPickerOpen && movPickFiltered.length > 0 ? (
                      <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-white/10 bg-[#141414] py-1 shadow-xl">
                        {movPickFiltered.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/[0.06]"
                              onClick={() => {
                                setMovProductId(p.id);
                                setMovProductSearch(`${p.name} · est. ${p.stock}`);
                                setMovPickerOpen(false);
                              }}
                            >
                              {p.name}{" "}
                              <span className="text-zinc-500">
                                · est. {p.stock} · {money.format(p.price)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {movPickerOpen && movProductSearch.trim() && movPickFiltered.length === 0 ? (
                      <p className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-500 shadow-xl">
                        Nenhum produto encontrado.
                      </p>
                    ) : null}
                  </div>
                  <label className="block text-[13px] text-zinc-500">
                    Tipo
                    <select
                      className="mt-1 w-full rounded-lg border border-white/[0.1] bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-100"
                      value={movKind}
                      onChange={(e) => setMovKind(e.target.value as "ENTRADA" | "SAIDA" | "AJUSTE")}
                    >
                      {kindOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {movKind !== "AJUSTE" ? (
                    <Input
                      label="Quantidade"
                      value={movQty}
                      onChange={(e) => setMovQty(e.target.value)}
                      placeholder="Ex.: 12"
                      required
                    />
                  ) : (
                    <Input
                      label="Novo saldo (inventário)"
                      value={movNewStock}
                      onChange={(e) => setMovNewStock(e.target.value)}
                      placeholder="Ex.: 48"
                      required
                    />
                  )}
                  <Input label="Observação (opcional)" value={movNote} onChange={(e) => setMovNote(e.target.value)} />
                  {movErr ? <p className="text-sm text-red-400/90">{movErr}</p> : null}
                  <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                    Registrar
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Input
              label="Filtrar histórico por produto"
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Digite parte do nome…"
            />
            <Card>
              <CardContent className="!p-0">
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Data</Th>
                        <Th>Produto</Th>
                        <Th>Tipo</Th>
                        <Th>Δ</Th>
                        <Th>Saldo</Th>
                        <Th>Por</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {movementsFiltered.map((m) => (
                        <Tr key={m.id}>
                          <Td className="whitespace-nowrap text-[13px] text-zinc-400">
                            {new Date(m.createdAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Td>
                          <Td className="text-zinc-200">{m.product.name}</Td>
                          <Td>{m.kind}</Td>
                          <Td className="tabular-nums">{m.delta >= 0 ? `+${m.delta}` : m.delta}</Td>
                          <Td className="tabular-nums text-zinc-400">
                            {m.balanceBefore} → {m.balanceAfter}
                          </Td>
                          <Td className="text-[13px] text-zinc-500">{m.createdBy.name}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog">
          <Card className="w-full max-w-md shadow-xl">
            <CardContent className="space-y-4 !p-6">
              <h3 className="text-base font-semibold text-zinc-100">{modal === "create" ? "Novo produto" : "Editar produto"}</h3>
              <form className="space-y-3" onSubmit={(e) => void onSubmitProduct(e)}>
                <Input label="Nome" value={formName} onChange={(e) => setFormName(e.target.value)} required />
                <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
                  <span className="text-zinc-400">Preço (R$)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={formatDigitsAsBRL(formPriceDigits)}
                    onChange={(e) => setFormPriceDigits(e.target.value.replace(/\D/g, ""))}
                    className="rounded-lg border border-white/[0.1] bg-[#141414] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/30"
                    required
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={formKitchen} onChange={(e) => setFormKitchen(e.target.checked)} />
                  Item de cozinha
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={formControls} onChange={(e) => setFormControls(e.target.checked)} />
                  Controla estoque
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                  Ativo na venda
                </label>
                {modal === "create" ? (
                  <Input
                    label="Estoque inicial (opcional)"
                    value={formInitialStock}
                    onChange={(e) => setFormInitialStock(e.target.value)}
                    placeholder="0"
                  />
                ) : null}
                {formErr ? <p className="text-sm text-red-400/90">{formErr}</p> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="ghost" onClick={closeModal} disabled={busy}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="primary" disabled={busy}>
                    Salvar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
