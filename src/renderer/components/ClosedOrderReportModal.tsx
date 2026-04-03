import { useEffect, useMemo, useState } from "react";
import { apiPdvOrder, type PdvOrder } from "../api";
import { Button } from "../ui/Button";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const KIND_LABEL: Record<PdvOrder["kind"], string> = {
  DIRECT: "Venda direta (balcão)",
  COMANDA: "Comanda",
};

export function ClosedOrderReportModal({
  open,
  orderId,
  token,
  onClose,
}: {
  open: boolean;
  orderId: string | null;
  token: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PdvOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId || !token) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    void apiPdvOrder(token, orderId)
      .then((o) => {
        if (!cancelled) {
          setData(o);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId, token]);

  const payTotals = useMemo(() => {
    if (!data?.payments?.length) {
      return null;
    }
    let gross = 0;
    let fee = 0;
    let net = 0;
    for (const p of data.payments) {
      gross += p.amountPaid;
      fee += p.feeAmount;
      net += p.netAmount;
    }
    return {
      gross: Math.round(gross * 100) / 100,
      fee: Math.round(fee * 100) / 100,
      net: Math.round(net * 100) / 100,
    };
  }, [data?.payments]);

  if (!open || !orderId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !loading && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="closed-order-report-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1e1e1e] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
          <h2 id="closed-order-report-title" className="text-lg font-semibold text-zinc-100">
            Relatório do pedido
          </h2>
          <Button type="button" variant="outline" className="!py-1.5 text-xs" disabled={loading} onClick={onClose}>
            Fechar
          </Button>
        </div>

        {loading ? (
          <p className="mt-6 text-sm text-zinc-500">Carregando…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-300">{error}</p>
        ) : data ? (
          <div className="mt-5 space-y-6 text-sm">
            <dl className="grid gap-2 text-zinc-400">
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Tipo</dt>
                <dd className="text-right text-zinc-200">{KIND_LABEL[data.kind]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Cliente / mesa</dt>
                <dd className="text-right text-zinc-200">
                  {data.customer?.name ?? data.clientName ?? "—"}
                  {data.customer?.phone ? ` · ${data.customer.phone}` : ""}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Status</dt>
                <dd className="text-right text-zinc-200">{data.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Abertura</dt>
                <dd className="text-right tabular-nums text-zinc-300">{dt.format(new Date(data.openedAt))}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Fechamento</dt>
                <dd className="text-right tabular-nums text-zinc-300">
                  {data.closedAt ? dt.format(new Date(data.closedAt)) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[11px] uppercase text-zinc-500">Operador</dt>
                <dd className="text-right text-zinc-300">
                  {data.createdBy.name} ({data.createdBy.login})
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-white/[0.06] pt-2">
                <dt className="text-[11px] uppercase text-zinc-500">Subtotal itens</dt>
                <dd className="text-right text-lg font-semibold tabular-nums text-amber-200/95">
                  {money.format(data.subtotal)}
                </dd>
              </div>
            </dl>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Itens</h3>
              {data.items.length === 0 ? (
                <p className="text-xs text-zinc-500">Nenhum item.</p>
              ) : (
                <ul className="space-y-2 rounded-lg border border-white/[0.06] p-3">
                  {data.items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2 text-xs">
                      <span className="text-zinc-300">
                        {i.productName}
                        {i.isKitchenItem ? (
                          <span className="ml-1 text-[10px] text-zinc-600">· cozinha</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-400">
                        {i.quantity} × {money.format(i.unitPrice)} = {money.format(i.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Pagamentos</h3>
              {!data.payments?.length ? (
                <p className="text-xs text-zinc-500">
                  {data.status === "CLOSED"
                    ? "Sem registros de pagamento (venda antiga ou estorno)."
                    : "Não aplicável."}
                </p>
              ) : (
                <>
                  <ul className="space-y-2 rounded-lg border border-white/[0.06] p-3">
                    {data.payments.map((p) => (
                      <li key={p.id} className="border-b border-white/[0.05] pb-2 text-xs last:border-0 last:pb-0">
                        <p className="font-medium text-zinc-200">{p.paymentMethodName}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                          <span>
                            Bruto <span className="tabular-nums text-zinc-300">{money.format(p.amountPaid)}</span>
                          </span>
                          <span>
                            Taxa <span className="tabular-nums text-zinc-300">{money.format(p.feeAmount)}</span>
                          </span>
                          <span className="text-emerald-400/90">
                            Líq. <span className="tabular-nums">{money.format(p.netAmount)}</span>
                          </span>
                        </div>
                        {p.cashReceived != null ? (
                          <p className="mt-1 text-[11px] text-zinc-500">
                            Recebido {money.format(p.cashReceived)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {payTotals ? (
                    <div className="mt-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2 text-xs">
                      <p className="text-zinc-400">
                        Total bruto <span className="tabular-nums text-zinc-200">{money.format(payTotals.gross)}</span>
                        {" · "}
                        Taxas <span className="tabular-nums text-zinc-200">{money.format(payTotals.fee)}</span>
                      </p>
                      <p className="mt-1 font-medium text-emerald-200/95">
                        Total líquido esperado na conta: {money.format(payTotals.net)}
                      </p>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <p className="font-mono text-[10px] text-zinc-600">ID: {data.id}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
