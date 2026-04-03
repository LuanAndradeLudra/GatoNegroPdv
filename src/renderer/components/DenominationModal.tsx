import { useMemo, useState } from "react";
import { BRL_DENOMINATION_VALUES, sumDenominationMap } from "../lib/brlDenominations";
import { cn } from "../lib/cn";
import { Button } from "../ui/Button";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function labelForValue(v: number): string {
  if (v >= 1) {
    return `R$ ${v.toFixed(0).replace(".", ",")}`;
  }
  return `${(v * 100).toFixed(0)} cent.`;
}

const stepBtnClass = cn(
  "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100",
  "dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800",
);

const qtyInputClass = cn(
  "w-12 rounded-lg border border-slate-200 bg-white py-1 text-center text-sm text-slate-900 outline-none",
  "focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500",
);

export function DenominationModal({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (denominations: Record<string, number>, totalReais: number) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});

  const total = useMemo(() => {
    const m: Record<string, number> = {};
    for (const [k, q] of Object.entries(counts)) {
      if (q > 0) {
        m[k] = q;
      }
    }
    return sumDenominationMap(m);
  }, [counts]);

  function setQty(face: number, qty: number) {
    const key = String(face);
    setCounts((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[key];
      } else {
        next[key] = Math.min(9999, Math.floor(qty));
      }
      return next;
    });
  }

  if (!open) {
    return null;
  }

  function handleApply() {
    const m: Record<string, number> = {};
    for (const [k, q] of Object.entries(counts)) {
      if (q > 0) {
        m[k] = q;
      }
    }
    if (sumDenominationMap(m) <= 0) {
      return;
    }
    onApply(m, total);
    setCounts({});
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Conferência de cédulas e moedas</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
          Informe a quantidade de cada denominação. O total é somado automaticamente.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {BRL_DENOMINATION_VALUES.map((v) => {
            const key = String(v);
            const q = counts[key] ?? 0;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
              >
                <span className="text-xs text-slate-600 dark:text-zinc-400">{labelForValue(v)}</span>
                <div className="flex items-center gap-1">
                  <button type="button" className={stepBtnClass} onClick={() => setQty(v, q - 1)}>
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    className={qtyInputClass}
                    value={q || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setQty(v, Number.isFinite(n) ? n : 0);
                    }}
                  />
                  <button type="button" className={stepBtnClass} onClick={() => setQty(v, q + 1)}>
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center dark:border-amber-900/50 dark:bg-amber-950/35">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200/90">Total conferido</p>
          <p className="text-xl font-bold tabular-nums text-amber-900 dark:text-amber-100">{money.format(total)}</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={total <= 0} onClick={handleApply}>
            Usar este total
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-500">
          O valor será transferido para o campo principal e enviado junto na abertura (com detalhe das denominações).
        </p>
      </div>
    </div>
  );
}
