import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCreateCustomer,
  apiCustomerOrdersReport,
  apiListCustomers,
  apiUpdateCustomer,
  type CustomerRow,
} from "./api";
import { useAuth } from "./AuthContext";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function CustomersScreen({ onBack }: { onBack: () => void }) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const canReport =
    state.status === "authenticated" && state.user.access.customerOrders;

  const [list, setList] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [reportFor, setReportFor] = useState<CustomerRow | null>(null);
  const [repFrom, setRepFrom] = useState("");
  const [repTo, setRepTo] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<Awaited<ReturnType<typeof apiCustomerOrdersReport>> | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const rows = await apiListCustomers(token, q.trim() || undefined);
      setList(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [token, q]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(t);
  }, [load, q]);

  function openCreate() {
    setModal("create");
    setEditing(null);
    setFormName("");
    setFormPhone("");
    setFormDocument("");
    setFormEmail("");
    setFormNotes("");
    setFormError(null);
  }

  function openEdit(c: CustomerRow) {
    setModal("edit");
    setEditing(c);
    setFormName(c.name);
    setFormPhone(c.phone ?? "");
    setFormDocument(c.document ?? "");
    setFormEmail(c.email ?? "");
    setFormNotes(c.notes ?? "");
    setFormError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      return;
    }
    setFormError(null);
    setBusy(true);
    try {
      if (modal === "create") {
        await apiCreateCustomer(token, {
          name: formName.trim(),
          phone: formPhone.trim() || null,
          document: formDocument.trim() || null,
          email: formEmail.trim() || null,
          notes: formNotes.trim() || null,
        });
      } else if (modal === "edit" && editing) {
        await apiUpdateCustomer(token, editing.id, {
          name: formName.trim(),
          phone: formPhone.trim() || null,
          document: formDocument.trim() || null,
          email: formEmail.trim() || null,
          notes: formNotes.trim() || null,
        });
      }
      setModal(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function openReport(c: CustomerRow) {
    if (!token || !canReport) {
      return;
    }
    setReportFor(c);
    setReportData(null);
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    setRepFrom(start.toISOString().slice(0, 10));
    setRepTo(end.toISOString().slice(0, 10));
  }

  async function loadReport() {
    if (!token || !reportFor || !repFrom || !repTo) {
      return;
    }
    setReportLoading(true);
    try {
      const data = await apiCustomerOrdersReport(token, reportFor.id, {
        from: repFrom,
        to: repTo,
        status: "CLOSED",
        kind: "COMANDA",
      });
      setReportData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no relatório");
    } finally {
      setReportLoading(false);
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="users-layout">
      <header className="users-toolbar">
        <button type="button" className="btn-ghost" onClick={onBack}>
          ← Voltar
        </button>
        <h1 className="users-title">Clientes</h1>
        <button type="button" className="btn-primary btn-small" onClick={openCreate} disabled={busy}>
          Novo cliente
        </button>
      </header>

      <div className="customers-toolbar">
        <input
          type="search"
          className="customers-search"
          placeholder="Buscar por nome, telefone ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? <p className="users-error">{error}</p> : null}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Documento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="mono">{c.phone ?? "—"}</td>
                <td className="mono">{c.document ?? "—"}</td>
                <td className="users-actions">
                  <button type="button" className="btn-link" onClick={() => openEdit(c)} disabled={busy}>
                    Editar
                  </button>
                  {canReport ? (
                    <button type="button" className="btn-link" onClick={() => void openReport(c)} disabled={busy}>
                      Comandas
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModal(null)}>
          <div className="modal-panel" role="dialog" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="modal-title">{modal === "create" ? "Novo cliente" : "Editar cliente"}</h2>
            <form className="modal-form" onSubmit={(e) => void onSubmit(e)}>
              <label className="field">
                <span>Nome *</span>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={busy} />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>CPF / CNPJ</span>
                <input value={formDocument} onChange={(e) => setFormDocument(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>E-mail</span>
                <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>Observações</span>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={busy}
                  className="customers-textarea"
                />
              </label>
              {formError ? <p className="login-error">{formError}</p> : null}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setModal(null)} disabled={busy}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={busy}>
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {reportFor && canReport ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReportFor(null)}>
          <div className="modal-panel modal-wide" role="dialog" onClick={(ev) => ev.stopPropagation()}>
            <h2 className="modal-title">Comandas — {reportFor.name}</h2>
            <p className="cash-muted">Comandas fechadas no período (vínculo por cliente cadastrado).</p>
            <div className="customers-report-filters">
              <label className="field">
                <span>De</span>
                <input type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
              </label>
              <label className="field">
                <span>Até</span>
                <input type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />
              </label>
              <button type="button" className="btn-primary" onClick={() => void loadReport()} disabled={reportLoading}>
                {reportLoading ? "Carregando…" : "Gerar"}
              </button>
            </div>
            {reportData ? (
              <>
                <p className="customers-total">
                  Total no período: <strong>{money.format(reportData.total)}</strong> ({reportData.orders.length}{" "}
                  comandas)
                </p>
                <div className="customers-report-table-wrap">
                  <table className="users-table">
                    <thead>
                      <tr>
                        <th>Fechamento</th>
                        <th>Subtotal</th>
                        <th>Mesa / obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.orders.map((o) => (
                        <tr key={o.id}>
                          <td>{o.closedAt ? dt.format(new Date(o.closedAt)) : "—"}</td>
                          <td>{money.format(o.subtotal)}</td>
                          <td>{o.clientName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setReportFor(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
