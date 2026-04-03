import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCashClose,
  apiCashCurrent,
  apiCashHistory,
  apiCashOpen,
  type CashSession,
  type User,
} from "./api";
import { useAuth } from "./AuthContext";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function hasVendas(user: User, action: "abrir" | "fechar"): boolean {
  return user.permissions.VENDAS.includes(action);
}

export function CashRegisterScreen({ onBack }: { onBack: () => void }) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const user = state.status === "authenticated" ? state.user : null;

  const [current, setCurrent] = useState<CashSession | null | undefined>(undefined);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openAmount, setOpenAmount] = useState("");
  const [closeAmount, setCloseAmount] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const [c, h] = await Promise.all([apiCashCurrent(token), apiCashHistory(token, 40)]);
      setCurrent(c);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar caixa");
      setCurrent(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onOpen(e: FormEvent) {
    e.preventDefault();
    if (!token || !user) {
      return;
    }
    const n = Number.parseFloat(openAmount.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setError("Informe um valor inicial válido.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCashOpen(token, n);
      setOpenAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir");
    } finally {
      setBusy(false);
    }
  }

  async function onClose(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const raw = closeAmount.trim();
      let closing: number | null | undefined = undefined;
      if (raw !== "") {
        const n = Number.parseFloat(raw.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) {
          setError("Valor de fechamento inválido.");
          setBusy(false);
          return;
        }
        closing = n;
      }
      await apiCashClose(token, closing);
      setCloseAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fechar");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) {
    return null;
  }

  const canOpen = hasVendas(user, "abrir");
  const canClose = hasVendas(user, "fechar");

  return (
    <div className="cash-layout">
      <header className="users-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h1 className="users-title">Caixa</h1>
        <span />
      </header>

      <div className="cash-main">
        {error ? <p className="users-error">{error}</p> : null}

        <section className="cash-card">
          <h2 className="cash-section-title">Situação atual</h2>
          {current === undefined ? (
            <p className="cash-muted">Carregando…</p>
          ) : current ? (
            <div className="cash-open">
              <p>
                <strong>Aberto</strong> desde {dt.format(new Date(current.openedAt))}
              </p>
              <p>
                Responsável: {current.openedBy.name} ({current.openedBy.login})
              </p>
              <p>Valor inicial: {money.format(current.initialValue)}</p>
              {canClose ? (
                <form className="cash-close-form" onSubmit={(e) => void onClose(e)}>
                  <label className="field">
                    <span>Valor contado no fechamento (opcional)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={closeAmount}
                      onChange={(e) => setCloseAmount(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? "Fechando…" : "Fechar caixa"}
                  </button>
                </form>
              ) : (
                <p className="cash-muted">Sem permissão para fechar o caixa.</p>
              )}
            </div>
          ) : (
            <div className="cash-closed">
              <p className="cash-muted">Nenhum caixa aberto no momento.</p>
              {canOpen ? (
                <form className="cash-open-form" onSubmit={(e) => void onOpen(e)}>
                  <label className="field">
                    <span>Valor inicial</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={openAmount}
                      onChange={(e) => setOpenAmount(e.target.value)}
                      disabled={busy}
                      required
                    />
                  </label>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? "Abrindo…" : "Abrir caixa"}
                  </button>
                </form>
              ) : (
                <p className="cash-muted">Sem permissão para abrir o caixa.</p>
              )}
            </div>
          )}
        </section>

        <section className="cash-card">
          <h2 className="cash-section-title">Histórico</h2>
          <div className="cash-table-wrap">
            <table className="users-table cash-history-table">
              <thead>
                <tr>
                  <th>Abertura</th>
                  <th>Fechamento</th>
                  <th>Inicial</th>
                  <th>Contado</th>
                  <th>Aberto por</th>
                  <th>Fechado por</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id}>
                    <td>{dt.format(new Date(s.openedAt))}</td>
                    <td>{s.closedAt ? dt.format(new Date(s.closedAt)) : "—"}</td>
                    <td>{money.format(s.initialValue)}</td>
                    <td>{s.closingBalance != null ? money.format(s.closingBalance) : "—"}</td>
                    <td>{s.openedBy.name}</td>
                    <td>{s.closedBy?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 ? <p className="cash-muted">Nenhum registro ainda.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
