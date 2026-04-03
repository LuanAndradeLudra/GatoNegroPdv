import { useEffect, useMemo, useState } from "react";
import type { PaymentMethodRow } from "../api";
import { formatDigitsAsBRL, parseDigitsToReais } from "../lib/moneyInput";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const KIND_LABEL: Record<PaymentMethodRow["kind"], string> = {
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  VALE: "Vale",
};

export type CheckoutPaymentLine = {
  paymentMethodId: string;
  amountPaid: number;
  cashReceived?: number | null;
};

type DraftLine = {
  paymentMethodId: string;
  amountDigits: string;
  cashReceivedDigits: string;
};

export function CheckoutModal({
  open,
  totalDue,
  itemsSubtotal,
  couvertAmount,
  serviceFeeAmount,
  methods,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Total a liquidar (itens + couvert + taxa). */
  totalDue: number;
  itemsSubtotal?: number;
  couvertAmount?: number;
  serviceFeeAmount?: number;
  methods: PaymentMethodRow[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (payments: CheckoutPaymentLine[]) => void;
}) {
  const activeMethods = useMemo(() => methods.filter((m) => m.active), [methods]);
  const [lines, setLines] = useState<CheckoutPaymentLine[]>([]);
  const [draft, setDraft] = useState<DraftLine | null>(null);

  useEffect(() => {
    if (open) {
      setLines([]);
      setDraft(null);
    }
  }, [open]);

  const paid = useMemo(() => round2(lines.reduce((s, l) => s + l.amountPaid, 0)), [lines]);
  const remaining = round2(totalDue - paid);

  function startDraft(methodId: string) {
    const rem = round2(totalDue - paid);
    const cents = Math.max(0, Math.round(rem * 100));
    setDraft({
      paymentMethodId: methodId,
      amountDigits: String(cents),
      cashReceivedDigits: "",
    });
  }

  function addDraft() {
    if (!draft) {
      return;
    }
    const m = activeMethods.find((x) => x.id === draft.paymentMethodId);
    if (!m) {
      return;
    }
    const amount = parseDigitsToReais(draft.amountDigits);
    if (amount === null || amount <= 0) {
      return;
    }
    let cashReceived: number | null | undefined = undefined;
    if (m.kind === "DINHEIRO") {
      const raw = draft.cashReceivedDigits.replace(/\D/g, "");
      if (raw !== "") {
        const cr = parseDigitsToReais(draft.cashReceivedDigits);
        if (cr === null || cr < amount) {
          return;
        }
        cashReceived = cr;
      }
    }
    const entry: CheckoutPaymentLine = {
      paymentMethodId: m.id,
      amountPaid: round2(amount),
    };
    if (cashReceived !== undefined) {
      entry.cashReceived = cashReceived ?? null;
    }
    setLines((prev) => [...prev, entry]);
    setDraft(null);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i));
  }

  const canConfirm =
    totalDue <= 0
      ? true
      : activeMethods.length > 0 && lines.length > 0 && Math.abs(round2(totalDue - paid)) <= 0.02;

  if (!open) {
    return null;
  }

  const selectedMethod = draft ? activeMethods.find((m) => m.id === draft.paymentMethodId) : null;
  const troco =
    selectedMethod?.kind === "DINHEIRO" && draft
      ? (() => {
          const amount = parseDigitsToReais(draft.amountDigits);
          const recv = parseDigitsToReais(draft.cashReceivedDigits);
          if (amount === null || recv === null || recv < amount) {
            return null;
          }
          return round2(recv - amount);
        })()
      : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="checkout-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-zinc-700">
          <div>
            <h2 id="checkout-title" className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
              Pagamento
            </h2>
            <div className="mt-1 space-y-1 text-sm text-slate-500 dark:text-zinc-500">
              {itemsSubtotal != null && (couvertAmount ?? 0) + (serviceFeeAmount ?? 0) > 0.001 ? (
                <p className="text-[11px] leading-relaxed">
                  Itens {money.format(itemsSubtotal)}
                  {(couvertAmount ?? 0) > 0.001 ? (
                    <span>
                      {" "}
                      · Couvert {money.format(couvertAmount ?? 0)}
                    </span>
                  ) : null}
                  {(serviceFeeAmount ?? 0) > 0.001 ? (
                    <span>
                      {" "}
                      · Taxa serviço {money.format(serviceFeeAmount ?? 0)}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <p>
                Total:{" "}
                <span className="font-semibold text-amber-800 dark:text-amber-200/95">{money.format(totalDue)}</span>
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" className="!py-1.5 text-xs" disabled={busy} onClick={onClose}>
            Fechar
          </Button>
        </div>

        {totalDue <= 0 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-zinc-400">Pedido sem valor. Confirme para encerrar.</p>
            <Button type="button" className="w-full" disabled={busy} onClick={() => onConfirm([])}>
              {busy ? "…" : "Confirmar"}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-600 dark:text-zinc-500">
                Pago: <span className="tabular-nums text-slate-900 dark:text-zinc-200">{money.format(paid)}</span>
              </span>
              <span
                className={
                  Math.abs(remaining) <= 0.02
                    ? "font-medium text-emerald-700 dark:text-emerald-400/90"
                    : "font-medium text-amber-700 dark:text-amber-300/90"
                }
              >
                Restante: {money.format(remaining)}
              </span>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
              Formas de pagamento
            </p>
            {activeMethods.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/35 dark:text-amber-100/90">
                Nenhuma forma de pagamento ativa. Cadastre em{" "}
                <strong className="font-semibold">Configurações</strong> antes de fechar vendas.
              </p>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {activeMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busy || Math.abs(remaining) <= 0.02}
                  onClick={() => startDraft(m.id)}
                  className="flex flex-col items-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-colors hover:border-blue-300 hover:bg-white disabled:opacity-40 dark:border-white/[0.08] dark:bg-zinc-800 dark:hover:border-amber-500/35 dark:hover:bg-zinc-800/90"
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-zinc-100">{m.name}</span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-500">{KIND_LABEL[m.kind]}</span>
                  {m.feePercent != null && m.feePercent > 0 ? (
                    <span className="mt-1 text-[10px] text-slate-500 dark:text-zinc-600">Taxa {m.feePercent}%</span>
                  ) : null}
                </button>
              ))}
            </div>

            {draft && selectedMethod ? (
              <div className="mt-5 space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200/90">{selectedMethod.name}</p>
                <Input
                  label="Valor desta parcela"
                  inputMode="numeric"
                  value={formatDigitsAsBRL(draft.amountDigits)}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, amountDigits: e.target.value.replace(/\D/g, "") } : d))
                  }
                  disabled={busy}
                />
                {selectedMethod.kind === "DINHEIRO" ? (
                  <>
                    <Input
                      label="Valor recebido (opcional — para troco)"
                      inputMode="numeric"
                      value={formatDigitsAsBRL(draft.cashReceivedDigits)}
                      onChange={(e) =>
                        setDraft((d) => (d ? { ...d, cashReceivedDigits: e.target.value.replace(/\D/g, "") } : d))
                      }
                      disabled={busy}
                    />
                    {troco !== null ? (
                      <p className="text-center text-lg font-semibold text-emerald-700 dark:text-emerald-300/95">
                        Troco: {money.format(troco)}
                      </p>
                    ) : null}
                  </>
                ) : null}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" disabled={busy} onClick={() => setDraft(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" className="flex-1" disabled={busy} onClick={() => addDraft()}>
                    Adicionar
                  </Button>
                </div>
              </div>
            ) : null}

            {lines.length > 0 ? (
              <ul className="mt-5 space-y-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
                {lines.map((l, i) => {
                  const m = activeMethods.find((x) => x.id === l.paymentMethodId);
                  return (
                    <li
                      key={`${l.paymentMethodId}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/40"
                    >
                      <span className="text-slate-800 dark:text-zinc-300">
                        {m?.name ?? "—"} · {money.format(l.amountPaid)}
                        {l.cashReceived != null ? (
                          <span className="text-slate-500 dark:text-zinc-500"> (recebido {money.format(l.cashReceived)})</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline dark:text-red-400/90"
                        disabled={busy}
                        onClick={() => removeLine(i)}
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <Button
              type="button"
              className="mt-6 w-full"
              disabled={busy || !canConfirm}
              onClick={() => onConfirm(lines)}
            >
              {busy ? "Processando…" : "Confirmar venda"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
