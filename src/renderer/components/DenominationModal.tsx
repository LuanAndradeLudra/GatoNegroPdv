import { useMemo, useState } from "react";
import { BRL_DENOMINATION_VALUES, sumDenominationMap } from "../lib/brlDenominations";
import { Button } from "../ui/Button";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function labelForValue(v: number): string {
  if (v >= 1) {
    return `R$ ${v.toFixed(0).replace(".", ",")}`;
  }
  return `${(v * 100).toFixed(0)} cent.`;
}

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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1a1a1a]/95 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-100">Conferência de cédulas e moedas</h3>
        <p className="mt-1 text-sm text-zinc-500">Informe a quantidade de cada denominação. O total é somado automaticamente.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {BRL_DENOMINATION_VALUES.map((v) => {
            const key = String(v);
            const q = counts[key] ?? 0;
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2"
              >
                <span className="text-xs text-zinc-400">{labelForValue(v)}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="h-8 w-8 rounded border border-white/15 text-zinc-300 hover:bg-white/10"
                    onClick={() => setQty(v, q - 1)}
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-12 rounded border border-white/10 bg-[#141414] py-1 text-center text-sm text-zinc-100"
                    value={q || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                      setQty(v, Number.isFinite(n) ? n : 0);
                    }}
                  />
                  <button
                    type="button"
                    className="h-8 w-8 rounded border border-white/15 text-zinc-300 hover:bg-white/10"
                    onClick={() => setQty(v, q + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-center">
          <p className="text-[11px] uppercase tracking-wide text-amber-200/80">Total conferido</p>
          <p className="text-xl font-bold tabular-nums text-amber-100">{money.format(total)}</p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={total <= 0} onClick={handleApply}>
            Usar este total
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          O valor será transferido para o campo principal e enviado junto na abertura (com detalhe das denominações).
        </p>
      </div>
    </div>
  );
}
