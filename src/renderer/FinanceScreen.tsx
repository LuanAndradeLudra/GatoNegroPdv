import { PanelRightOpen } from "lucide-react";
import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  apiFinanceCashFlow,
  apiFinanceOrder,
  apiFinanceSalesSummary,
  type FinanceCashFlowResponse,
  type FinanceSalesSummaryResponse,
} from "./api";
import { useAuth } from "./AuthContext";
import { CashSessionDetailModal } from "./components/CashSessionDetailModal";
import { ClosedOrderReportModal } from "./components/ClosedOrderReportModal";
import { addCalendarDaysYmdSaoPaulo, todayYmdSaoPaulo } from "./lib/dateSaoPaulo";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const SHIFT_LABEL: Record<string, string> = {
  MANHA: "Manhã",
  TARDE: "Tarde",
  NOITE: "Noite",
  CUSTOM: "Outro",
};

const KIND_LABEL: Record<string, string> = {
  DIRECT: "Balcão",
  COMANDA: "Comanda",
};

type Tab = "fluxo" | "vendas";

function defaultRange(): { from: string; to: string } {
  const t = todayYmdSaoPaulo();
  return { from: t, to: t };
}

export function FinanceScreen() {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;

  const [tab, setTab] = useState<Tab>("fluxo");
  const [range, setRange] = useState(defaultRange);
  const [fluxo, setFluxo] = useState<FinanceCashFlowResponse | null>(null);
  const [vendas, setVendas] = useState<FinanceSalesSummaryResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cashDetailSessionId, setCashDetailSessionId] = useState<string | null>(null);
  const [reportOrderId, setReportOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      if (tab === "fluxo") {
        const data = await apiFinanceCashFlow(token, { from: range.from, to: range.to });
        setFluxo(data);
      } else {
        const data = await apiFinanceSalesSummary(token, { from: range.from, to: range.to });
        setVendas(data);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setBusy(false);
    }
  }, [token, tab, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFluxoRowKey(e: KeyboardEvent<HTMLTableRowElement>, sessionId: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setCashDetailSessionId(sessionId);
    }
  }

  const tabBtn = (active: boolean) =>
    cn(
      "rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "border-l-blue-600 bg-blue-50 text-blue-900 dark:border-l-blue-500 dark:bg-blue-950/40 dark:text-blue-100"
        : "border-l-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
    );

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      <div className="border-b border-slate-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Financeiro</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Fluxo e relatórios</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">
          Turnos de caixa fechados (sangria, suprimento, vendas) e resumo de vendas por forma de pagamento.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40 dark:shadow-none">
        <div className="flex flex-wrap gap-2">
          <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
            Atalhos (fuso São Paulo)
          </span>
          <Button
            type="button"
            variant="ghost"
            className="!py-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              const t = todayYmdSaoPaulo();
              setRange({ from: t, to: t });
            }}
          >
            Hoje
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="!py-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              const t = addCalendarDaysYmdSaoPaulo(todayYmdSaoPaulo(), -1);
              setRange({ from: t, to: t });
            }}
          >
            Ontem
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="!py-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              const to = todayYmdSaoPaulo();
              const from = addCalendarDaysYmdSaoPaulo(to, -6);
              setRange({ from, to });
            }}
          >
            Últimos 7 dias
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Input
            label="De"
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            disabled={busy}
          />
          <Input
            label="Até"
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            disabled={busy}
          />
          <Button type="button" variant="outline" onClick={() => void load()} disabled={busy}>
            Atualizar
          </Button>
        </div>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {err}
        </p>
      ) : null}
      {busy && !fluxo && tab === "fluxo" ? (
        <p className="text-sm text-slate-500 dark:text-zinc-500">Carregando fluxo de caixa…</p>
      ) : null}
      {busy && !vendas && tab === "vendas" ? (
        <p className="text-sm text-slate-500 dark:text-zinc-500">Carregando relatório…</p>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3 dark:border-zinc-800">
        <button type="button" onClick={() => setTab("fluxo")} className={tabBtn(tab === "fluxo")}>
          Fluxo de caixa
        </button>
        <button type="button" onClick={() => setTab("vendas")} className={tabBtn(tab === "vendas")}>
          Relatório de vendas
        </button>
      </div>

      {tab === "fluxo" && fluxo ? (
        <Card>
          <CardContent className="!p-0">
            <p className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-zinc-800 dark:text-zinc-500">
              Período (fechamento): {new Date(fluxo.filter.from).toLocaleDateString("pt-BR")} —{" "}
              {new Date(fluxo.filter.to).toLocaleDateString("pt-BR")} · {fluxo.sessions.length} turno(s)
            </p>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Fechamento</Th>
                    <Th>Turno</Th>
                    <Th>Inicial</Th>
                    <Th>Sangrias</Th>
                    <Th>Suprimentos</Th>
                    <Th>Vendas líq.</Th>
                    <Th>Taxas</Th>
                    <Th>Esperado (gaveta)</Th>
                    <Th>Fechamento contado</Th>
                    <Th>Diferença</Th>
                    <Th className="text-right"> </Th>
                  </Tr>
                </THead>
                <TBody>
                  {fluxo.sessions.length === 0 ? (
                    <Tr>
                      <Td colSpan={11} className="text-center text-slate-500 dark:text-zinc-500">
                        Nenhum turno fechado neste período.
                      </Td>
                    </Tr>
                  ) : (
                    fluxo.sessions.map((s) => (
                      <Tr
                        key={s.sessionId}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                        onClick={() => setCashDetailSessionId(s.sessionId)}
                        onKeyDown={(e) => onFluxoRowKey(e, s.sessionId)}
                      >
                        <Td className="whitespace-nowrap text-[13px] text-slate-600 dark:text-zinc-300">
                          {new Date(s.closedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Td>
                        <Td className="text-slate-800 dark:text-zinc-200">
                          {SHIFT_LABEL[s.shift] ?? s.shift}
                          {s.shift === "CUSTOM" && s.shiftCustomLabel ? ` (${s.shiftCustomLabel})` : ""}
                        </Td>
                        <Td className="tabular-nums text-slate-900 dark:text-zinc-100">{money.format(s.initialValue)}</Td>
                        <Td className="tabular-nums text-red-600 dark:text-red-300/90">−{money.format(s.totalSangria)}</Td>
                        <Td className="tabular-nums text-emerald-700 dark:text-emerald-300/90">
                          +{money.format(s.totalSuprimento)}
                        </Td>
                        <Td className="tabular-nums font-medium text-slate-900 dark:text-zinc-100">{money.format(s.salesNet)}</Td>
                        <Td className="tabular-nums text-slate-500 dark:text-zinc-500">{money.format(s.fees)}</Td>
                        <Td
                          className="tabular-nums text-slate-600 dark:text-zinc-400"
                          title="Fundo + suprimentos − sangrias + vendas em dinheiro (bruto)"
                        >
                          {money.format(s.expectedDrawerCash)}
                        </Td>
                        <Td className="tabular-nums text-slate-800 dark:text-zinc-200">
                          {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                        </Td>
                        <Td
                          className={cn(
                            "tabular-nums font-medium",
                            s.closingVariance == null
                              ? "text-slate-500 dark:text-zinc-500"
                              : s.closingVariance < -0.005
                                ? "text-red-600 dark:text-red-400"
                                : s.closingVariance > 0.005
                                  ? "text-emerald-700 dark:text-emerald-400/90"
                                  : "text-slate-700 dark:text-zinc-300",
                          )}
                          title={s.closingVariance != null ? "Contado − esperado na gaveta" : undefined}
                        >
                          {s.closingVariance != null ? money.format(s.closingVariance) : "—"}
                        </Td>
                        <Td className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                            <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                            Detalhes
                          </span>
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </div>
            <p className="border-t border-slate-200 px-4 py-3 text-[11px] leading-relaxed text-slate-600 dark:border-zinc-800 dark:text-zinc-500">
              Clique em uma linha para ver o mesmo detalhe da página Caixa (sangrias, suprimentos, observações). Vendas
              líq. = soma das parcelas líquidas dos pedidos fechados naquele turno (após taxas de maquininha).{" "}
              <strong className="font-medium text-slate-800 dark:text-zinc-400">Esperado (gaveta)</strong> = fundo de troco +
              suprimentos − sangrias + vendas em <span className="text-slate-700 dark:text-zinc-400">dinheiro</span> (bruto).{" "}
              <strong className="font-medium text-slate-800 dark:text-zinc-400">Diferença</strong> = contado ao fechar −
              esperado (quebra em vermelho, sobra em verde).
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tab === "vendas" && vendas ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                  Pedidos fechados
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                  {vendas.totalClosedOrdersInPeriod}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                  Total líquido
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-200/95">
                  {money.format(vendas.totalNet)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                  Ticket médio
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                  {money.format(vendas.averageTicket)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                  Taxas (maquininha)
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-600 dark:text-zinc-400">
                  {money.format(vendas.totalFees)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="!p-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Top 5 produtos (quantidade vendida)</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-500">
                No período selecionado — itens somados em todos os pedidos fechados.
              </p>
              {vendas.topProducts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500 dark:text-zinc-500">Nenhum item vendido no período.</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {vendas.topProducts.map((p, i) => (
                    <li key={p.productId} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-500 dark:text-zinc-400">
                        {i + 1}. <span className="text-slate-900 dark:text-zinc-200">{p.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-amber-800 dark:text-amber-200/90">
                        {p.quantitySold} un.
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 !p-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Por tipo de venda</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-zinc-500">Balcão (direta)</span>
                  <span className="tabular-nums font-medium text-slate-900 dark:text-zinc-100">
                    {money.format(vendas.byKind.DIRECT)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-zinc-500">Comanda</span>
                  <span className="tabular-nums font-medium text-slate-900 dark:text-zinc-100">
                    {money.format(vendas.byKind.COMANDA)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-0">
                <p className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 dark:border-zinc-800 dark:text-zinc-200">
                  Por forma de pagamento
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Forma</Th>
                        <Th>Líquido</Th>
                        <Th>Bruto</Th>
                        <Th>Taxa</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {vendas.byPaymentMethod.length === 0 ? (
                        <Tr>
                          <Td colSpan={4} className="text-center text-slate-500 dark:text-zinc-500">
                            Nenhuma venda no período.
                          </Td>
                        </Tr>
                      ) : (
                        vendas.byPaymentMethod.map((m) => (
                          <Tr key={m.paymentMethodId}>
                            <Td className="text-slate-900 dark:text-zinc-200">{m.name}</Td>
                            <Td className="tabular-nums font-medium text-slate-900 dark:text-zinc-100">{money.format(m.net)}</Td>
                            <Td className="tabular-nums text-slate-500 dark:text-zinc-500">{money.format(m.gross)}</Td>
                            <Td className="tabular-nums text-slate-500 dark:text-zinc-500">{money.format(m.fee)}</Td>
                          </Tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="!p-0">
              <p className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 dark:border-zinc-800 dark:text-zinc-200">
                Pedidos no período
              </p>
              <p className="border-b border-slate-200 px-4 py-1.5 text-[11px] text-slate-500 dark:border-zinc-800 dark:text-zinc-500">
                Clique em um pedido para abrir o relatório completo (itens e pagamentos), como no PDV.
              </p>
              <div className="max-h-[min(480px,60vh)] overflow-x-auto overflow-y-auto">
                <Table>
                  <THead>
                    <Tr>
                      <Th>Fechamento</Th>
                      <Th>Tipo</Th>
                      <Th>Cliente / mesa</Th>
                      <Th>Líquido</Th>
                      <Th>Taxas</Th>
                      <Th className="text-right"> </Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {(vendas.orders ?? []).length === 0 ? (
                      <Tr>
                        <Td colSpan={6} className="text-center text-slate-500 dark:text-zinc-500">
                          Nenhum pedido fechado neste período.
                        </Td>
                      </Tr>
                    ) : (
                      vendas.orders.map((o) => (
                        <Tr
                          key={o.orderId}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                          onClick={() => setReportOrderId(o.orderId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setReportOrderId(o.orderId);
                            }
                          }}
                        >
                          <Td className="whitespace-nowrap text-[13px] text-slate-600 dark:text-zinc-300">
                            {new Date(o.closedAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Td>
                          <Td className="text-slate-600 dark:text-zinc-400">{KIND_LABEL[o.kind] ?? o.kind}</Td>
                          <Td className="max-w-[200px] truncate text-slate-800 dark:text-zinc-300">{o.clientLabel}</Td>
                          <Td className="tabular-nums font-medium text-slate-900 dark:text-zinc-100">
                            {money.format(o.totalNet)}
                          </Td>
                          <Td className="tabular-nums text-slate-500 dark:text-zinc-500">{money.format(o.totalFees)}</Td>
                          <Td className="text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                              Relatório
                            </span>
                          </Td>
                        </Tr>
                      ))
                    )}
                  </TBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <p className="text-[11px] text-slate-600 dark:text-zinc-500">
            Período (data de fechamento do pedido, fuso São Paulo): {new Date(vendas.filter.from).toLocaleDateString("pt-BR")}{" "}
            — {new Date(vendas.filter.to).toLocaleDateString("pt-BR")}.
            {vendas.ordersTruncated ? (
              <span className="ml-1 block sm:inline">
                <span className="font-semibold text-amber-800 dark:text-amber-400/95">
                  Exibindo os 2000 pedidos mais recentes de {vendas.totalClosedOrdersInPeriod} no período.
                </span>{" "}
                Refine o filtro de datas para ver registros mais antigos na lista.
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      <CashSessionDetailModal
        open={cashDetailSessionId != null}
        sessionId={cashDetailSessionId}
        token={token}
        onClose={() => setCashDetailSessionId(null)}
      />
      <ClosedOrderReportModal
        open={reportOrderId != null}
        orderId={reportOrderId}
        token={token}
        onClose={() => setReportOrderId(null)}
        fetchOrder={apiFinanceOrder}
      />
    </div>
  );
}
