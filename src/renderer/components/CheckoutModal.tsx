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
  subtotal,
  methods,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  subtotal: number;
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
  const remaining = round2(subtotal - paid);

  function startDraft(methodId: string) {
    const rem = round2(subtotal - paid);
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
    subtotal <= 0
      ? true
      : activeMethods.length > 0 && lines.length > 0 && Math.abs(round2(subtotal - paid)) <= 0.02;

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
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="checkout-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1c1c1c] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
          <div>
            <h2 id="checkout-title" className="text-lg font-semibold text-zinc-100">
              Pagamento
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Total do pedido: <span className="font-semibold text-amber-200/95">{money.format(subtotal)}</span>
            </p>
          </div>
          <Button type="button" variant="outline" className="!py-1.5 text-xs" disabled={busy} onClick={onClose}>
            Fechar
          </Button>
        </div>

        {subtotal <= 0 ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-400">Pedido sem valor. Confirme para encerrar.</p>
            <Button type="button" className="w-full" disabled={busy} onClick={() => onConfirm([])}>
              {busy ? "…" : "Confirmar"}
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-zinc-500">
                Pago: <span className="tabular-nums text-zinc-200">{money.format(paid)}</span>
              </span>
              <span
                className={
                  Math.abs(remaining) <= 0.02 ? "font-medium text-emerald-400/90" : "font-medium text-amber-300/90"
                }
              >
                Restante: {money.format(remaining)}
              </span>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Formas de pagamento</p>
            {activeMethods.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100/90">
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
                  className="flex flex-col items-start rounded-xl border border-white/[0.08] bg-[#252525] px-3 py-3 text-left transition-colors hover:border-amber-500/35 hover:bg-[#2a2a2a] disabled:opacity-40"
                >
                  <span className="text-sm font-medium text-zinc-100">{m.name}</span>
                  <span className="text-[10px] text-zinc-500">{KIND_LABEL[m.kind]}</span>
                  {m.feePercent != null && m.feePercent > 0 ? (
                    <span className="mt-1 text-[10px] text-zinc-600">Taxa {m.feePercent}%</span>
                  ) : null}
                </button>
              ))}
            </div>

            {draft && selectedMethod ? (
              <div className="mt-5 space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                <p className="text-xs font-medium text-amber-200/90">{selectedMethod.name}</p>
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
                      <p className="text-center text-lg font-semibold text-emerald-300/95">Troco: {money.format(troco)}</p>
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
              <ul className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
                {lines.map((l, i) => {
                  const m = activeMethods.find((x) => x.id === l.paymentMethodId);
                  return (
                    <li
                      key={`${l.paymentMethodId}-${i}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm"
                    >
                      <span className="text-zinc-300">
                        {m?.name ?? "—"} · {money.format(l.amountPaid)}
                        {l.cashReceived != null ? (
                          <span className="text-zinc-500"> (recebido {money.format(l.cashReceived)})</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="text-xs text-red-400/90 hover:underline"
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
