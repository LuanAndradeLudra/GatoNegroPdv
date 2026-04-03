import { useEffect, useMemo, useState } from "react";
import {
  apiCashSessionDetail,
  type CashMovementRow,
  type CashSession,
} from "../api";
import { Button } from "../ui/Button";

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => onClose()}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="cash-session-detail-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1e1e1e]/98 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
          <h3 id="cash-session-detail-title" className="text-lg font-semibold text-zinc-100">
            Detalhe da sessão
          </h3>
          <Button type="button" variant="outline" className="shrink-0 !py-1.5 text-xs" onClick={onClose}>
            Fechar
          </Button>
        </div>

        {detailLoading ? (
          <p className="mt-6 text-sm text-zinc-500">Carregando…</p>
        ) : detailError ? (
          <p className="mt-6 text-sm text-red-300">{detailError}</p>
        ) : detailPayload ? (
          <div className="mt-5 space-y-5 text-sm">
            <dl className="grid gap-3 text-zinc-400 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase text-zinc-500">Abertura</dt>
                <dd className="text-zinc-200">{dt.format(new Date(detailPayload.session.openedAt))}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-zinc-500">Fechamento</dt>
                <dd className="text-zinc-200">
                  {detailPayload.session.closedAt
                    ? dt.format(new Date(detailPayload.session.closedAt))
                    : "— (turno ainda aberto)"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-zinc-500">Turno</dt>
                <dd className="text-zinc-200">{shiftLabel(detailPayload.session)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-zinc-500">Fundo inicial</dt>
                <dd className="tabular-nums text-amber-200/90">{money.format(detailPayload.session.initialValue)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase text-zinc-500">Valor contado</dt>
                <dd className="tabular-nums text-zinc-200">
                  {detailPayload.session.closingBalance != null
                    ? money.format(detailPayload.session.closingBalance)
                    : "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase text-zinc-500">Aberto por / Fechado por</dt>
                <dd className="text-zinc-200">
                  {detailPayload.session.openedBy.name}
                  {" · "}
                  {detailPayload.session.closedBy?.name ?? "—"}
                </dd>
              </div>
            </dl>

            {detailPayload.session.openingNotes ? (
              <p className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
                <span className="text-[11px] uppercase text-zinc-500">Obs. abertura</span>
                <br />
                {detailPayload.session.openingNotes}
              </p>
            ) : null}

            <p className="font-mono text-[11px] text-zinc-600">ID: {detailPayload.session.id}</p>

            {detailTotals ? (
              <div className="flex flex-wrap gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase text-zinc-500">Total sangrias</p>
                  <p className="tabular-nums text-rose-300/90">{money.format(detailTotals.sangria)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase text-zinc-500">Total suprimentos</p>
                  <p className="tabular-nums text-sky-300/90">{money.format(detailTotals.suprimento)}</p>
                </div>
              </div>
            ) : null}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Sangrias e suprimentos
              </h4>
              {detailPayload.movements.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/[0.1] px-3 py-4 text-center text-xs text-zinc-500">
                  Nenhuma movimentação registrada neste turno.
                </p>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-white/[0.06] p-3">
                  {detailPayload.movements.map((m) => (
                    <li
                      key={m.id}
                      className="border-b border-white/[0.05] pb-2 text-xs last:border-0 last:pb-0"
                    >
                      <span className={m.type === "SANGRIA" ? "text-rose-300/90" : "text-sky-300/90"}>
                        {m.type === "SANGRIA" ? "Sangria" : "Suprimento"} · {money.format(m.amount)}
                      </span>
                      <span className="ml-2 text-zinc-500">
                        {dt.format(new Date(m.createdAt))} · {m.createdBy.name}
                      </span>
                      {m.note ? <p className="mt-1 text-zinc-500">{m.note}</p> : null}
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
