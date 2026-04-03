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

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: localYmd(from), to: localYmd(to) };
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Financeiro</p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-100">Fluxo e relatórios</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Turnos de caixa fechados (sangria, suprimento, vendas) e resumo de vendas por forma de pagamento.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-white/[0.08] bg-[#181818]/80 p-4">
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

      {err ? <p className="text-sm text-red-400/90">{err}</p> : null}
      {busy && !fluxo && tab === "fluxo" ? <p className="text-sm text-zinc-500">Carregando fluxo de caixa…</p> : null}
      {busy && !vendas && tab === "vendas" ? <p className="text-sm text-zinc-500">Carregando relatório…</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-3">
        <button
          type="button"
          onClick={() => setTab("fluxo")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "fluxo" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          Fluxo de caixa
        </button>
        <button
          type="button"
          onClick={() => setTab("vendas")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "vendas" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          Relatório de vendas
        </button>
      </div>

      {tab === "fluxo" && fluxo ? (
        <Card>
          <CardContent className="!p-0">
            <p className="border-b border-white/[0.06] px-4 py-2 text-[11px] text-zinc-500">
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
                    <Th>Fechamento contado</Th>
                    <Th className="text-right"> </Th>
                  </Tr>
                </THead>
                <TBody>
                  {fluxo.sessions.length === 0 ? (
                    <Tr>
                      <Td colSpan={9} className="text-center text-zinc-500">
                        Nenhum turno fechado neste período.
                      </Td>
                    </Tr>
                  ) : (
                    fluxo.sessions.map((s) => (
                      <Tr
                        key={s.sessionId}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer hover:bg-white/[0.03]"
                        onClick={() => setCashDetailSessionId(s.sessionId)}
                        onKeyDown={(e) => onFluxoRowKey(e, s.sessionId)}
                      >
                        <Td className="whitespace-nowrap text-[13px] text-zinc-300">
                          {new Date(s.closedAt).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Td>
                        <Td>
                          {SHIFT_LABEL[s.shift] ?? s.shift}
                          {s.shift === "CUSTOM" && s.shiftCustomLabel ? ` (${s.shiftCustomLabel})` : ""}
                        </Td>
                        <Td className="tabular-nums">{money.format(s.initialValue)}</Td>
                        <Td className="tabular-nums text-red-300/90">−{money.format(s.totalSangria)}</Td>
                        <Td className="tabular-nums text-emerald-300/90">+{money.format(s.totalSuprimento)}</Td>
                        <Td className="tabular-nums font-medium text-zinc-100">{money.format(s.salesNet)}</Td>
                        <Td className="tabular-nums text-zinc-500">{money.format(s.fees)}</Td>
                        <Td className="tabular-nums">
                          {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                        </Td>
                        <Td className="text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400/90">
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
            <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
              Clique em uma linha para ver o mesmo detalhe da página Caixa (sangrias, suprimentos, observações). Vendas
              líq. = soma das parcelas líquidas dos pedidos fechados naquele turno (após taxas de maquininha).
            </p>
          </CardContent>
        </Card>
      ) : null}

      {tab === "vendas" && vendas ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Pedidos fechados</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{vendas.orderCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Total líquido</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-200/95">{money.format(vendas.totalNet)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Ticket médio</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{money.format(vendas.averageTicket)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Taxas (maquininha)</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-400">{money.format(vendas.totalFees)}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 !p-4">
                <p className="text-sm font-medium text-zinc-200">Por tipo de venda</p>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Balcão (direta)</span>
                  <span className="tabular-nums text-zinc-100">{money.format(vendas.byKind.DIRECT)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Comanda</span>
                  <span className="tabular-nums text-zinc-100">{money.format(vendas.byKind.COMANDA)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="!p-0">
                <p className="border-b border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200">
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
                          <Td colSpan={4} className="text-center text-zinc-500">
                            Nenhuma venda no período.
                          </Td>
                        </Tr>
                      ) : (
                        vendas.byPaymentMethod.map((m) => (
                          <Tr key={m.paymentMethodId}>
                            <Td className="text-zinc-200">{m.name}</Td>
                            <Td className="tabular-nums">{money.format(m.net)}</Td>
                            <Td className="tabular-nums text-zinc-500">{money.format(m.gross)}</Td>
                            <Td className="tabular-nums text-zinc-500">{money.format(m.fee)}</Td>
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
              <p className="border-b border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200">
                Pedidos no período
              </p>
              <p className="border-b border-white/[0.06] px-4 py-1.5 text-[11px] text-zinc-500">
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
                        <Td colSpan={6} className="text-center text-zinc-500">
                          Nenhum pedido fechado neste período.
                        </Td>
                      </Tr>
                    ) : (
                      vendas.orders.map((o) => (
                        <Tr
                          key={o.orderId}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer hover:bg-white/[0.03]"
                          onClick={() => setReportOrderId(o.orderId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setReportOrderId(o.orderId);
                            }
                          }}
                        >
                          <Td className="whitespace-nowrap text-[13px] text-zinc-300">
                            {new Date(o.closedAt).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Td>
                          <Td className="text-zinc-400">{KIND_LABEL[o.kind] ?? o.kind}</Td>
                          <Td className="max-w-[200px] truncate text-zinc-300">{o.clientLabel}</Td>
                          <Td className="tabular-nums font-medium text-zinc-100">{money.format(o.totalNet)}</Td>
                          <Td className="tabular-nums text-zinc-500">{money.format(o.totalFees)}</Td>
                          <Td className="text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400/90">
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

          <p className="text-[11px] text-zinc-500">
            Período (data de fechamento do pedido): {new Date(vendas.filter.from).toLocaleDateString("pt-BR")} —{" "}
            {new Date(vendas.filter.to).toLocaleDateString("pt-BR")}.
            {(vendas.orders?.length ?? 0) >= 2000 ? (
              <span className="ml-1 text-amber-400/90">
                Lista limitada a 2000 pedidos; refine o período se necessário.
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
