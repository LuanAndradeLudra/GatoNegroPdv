import { useEffect, useMemo, useState } from "react";
import {
  apiCashSessionDetail,
  type CashMovementRow,
  type CashSession,
} from "../api";
import { Button } from "../ui/Button";
import { cn } from "../lib/cn";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function shiftLabel(s: CashSession): string {
  if (s.shift === "CUSTOM") {
    return s.shiftCustomLabel?.trim() || "Personalizado";
  }
  const m: Record<string, string> = {
    MANHA: "Manhã",
    TARDE: "Tarde",
    NOITE: "Noite",
    CUSTOM: "Personalizado",
  };
  return m[s.shift] ?? s.shift;
}

function movementTotals(movements: CashMovementRow[]): { sangria: number; suprimento: number } {
  let sangria = 0;
  let suprimento = 0;
  for (const m of movements) {
    if (m.type === "SANGRIA") {
      sangria += m.amount;
    } else {
      suprimento += m.amount;
    }
  }
  return { sangria, suprimento };
}

export function CashSessionDetailModal({
  open,
  sessionId,
  token,
  onClose,
}: {
  open: boolean;
  sessionId: string | null;
  token: string | null;
  onClose: () => void;
}) {
  const [detailPayload, setDetailPayload] = useState<{
    session: CashSession;
    movements: CashMovementRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !sessionId || !token) {
      setDetailPayload(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetailPayload(null);
    void apiCashSessionDetail(token, sessionId)
      .then((data) => {
        if (!cancelled) {
          setDetailPayload(data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDetailError(e instanceof Error ? e.message : "Erro ao carregar detalhes");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, sessionId, token]);

  const detailTotals = useMemo(
    () => (detailPayload ? movementTotals(detailPayload.movements) : null),
    [detailPayload],
  );

  if (!open) {
    return null;
  }

  const muted = "text-slate-500 dark:text-zinc-500";
  const dtLabel = "text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-500";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="cash-session-detail-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-zinc-700">
          <h3 id="cash-session-detail-title" className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
            Detalhe da sessão
          </h3>
          <Button type="button" variant="outline" className="shrink-0 !py-1.5 text-xs" onClick={onClose}>
            Fechar
          </Button>
        </div>

        {detailLoading ? (
          <p className={cn("mt-6 text-sm", muted)}>Carregando…</p>
        ) : detailError ? (
          <p className="mt-6 text-sm text-red-600 dark:text-red-400">{detailError}</p>
        ) : detailPayload ? (
          <div className="mt-5 space-y-5 text-sm">
            <dl className="grid gap-3 text-slate-600 sm:grid-cols-2 dark:text-zinc-300">
              <div>
                <dt className={dtLabel}>Abertura</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">{dt.format(new Date(detailPayload.session.openedAt))}</dd>
              </div>
              <div>
                <dt className={dtLabel}>Fechamento</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">
                  {detailPayload.session.closedAt
                    ? dt.format(new Date(detailPayload.session.closedAt))
                    : "— (turno ainda aberto)"}
                </dd>
              </div>
              <div>
                <dt className={dtLabel}>Turno</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">{shiftLabel(detailPayload.session)}</dd>
              </div>
              <div>
                <dt className={dtLabel}>Fundo inicial</dt>
                <dd className="tabular-nums font-semibold text-amber-700 dark:text-amber-300">{money.format(detailPayload.session.initialValue)}</dd>
              </div>
              <div>
                <dt className={dtLabel}>Valor contado</dt>
                <dd className="tabular-nums font-medium text-slate-900 dark:text-zinc-200">
                  {detailPayload.session.closingBalance != null
                    ? money.format(detailPayload.session.closingBalance)
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className={dtLabel}>Aberto por / Fechado por</dt>
                <dd className="font-medium text-slate-900 dark:text-zinc-100">
                  {detailPayload.session.openedBy.name}
                  {" · "}
                  {detailPayload.session.closedBy?.name ?? "—"}
                </dd>
              </div>
            </dl>

            {detailPayload.session.openingNotes ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
                <span className="text-[11px] font-semibold uppercase text-slate-500 dark:text-zinc-500">Obs. abertura</span>
                <br />
                {detailPayload.session.openingNotes}
              </p>
            ) : null}

            <p className="font-mono text-[11px] text-slate-400 dark:text-zinc-600">ID: {detailPayload.session.id}</p>

            {detailTotals ? (
              <div className="flex flex-wrap gap-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                <div>
                  <p className={dtLabel}>Total sangrias</p>
                  <p className="tabular-nums font-semibold text-rose-700 dark:text-rose-300">{money.format(detailTotals.sangria)}</p>
                </div>
                <div>
                  <p className={dtLabel}>Total suprimentos</p>
                  <p className="tabular-nums font-semibold text-sky-700 dark:text-sky-300">{money.format(detailTotals.suprimento)}</p>
                </div>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
                Sangrias e suprimentos
              </h4>
              {detailPayload.movements.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500 dark:border-zinc-700 dark:text-zinc-500">
                  Nenhuma movimentação registrada neste turno.
                </p>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
                  {detailPayload.movements.map((m) => (
                    <li key={m.id} className="border-b border-slate-100 pb-2 text-xs last:border-0 last:pb-0 dark:border-zinc-700">
                      <span className={m.type === "SANGRIA" ? "font-medium text-rose-700 dark:text-rose-300" : "font-medium text-sky-700 dark:text-sky-300"}>
                        {m.type === "SANGRIA" ? "Sangria" : "Suprimento"} · {money.format(m.amount)}
                      </span>
                      <span className={cn("ml-2", muted)}>
                        {dt.format(new Date(m.createdAt))} · {m.createdBy.name}
                      </span>
                      {m.note ? <p className={cn("mt-1", muted)}>{m.note}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
