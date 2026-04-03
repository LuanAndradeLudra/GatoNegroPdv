import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCreateCustomer,
  apiCustomerOrdersReport,
  apiListCustomers,
  apiUpdateCustomer,
  type CustomerRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function CustomersScreen() {
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
    <div className="space-y-4 px-4 pb-8 pt-2 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          className="w-full max-w-md rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
          placeholder="Buscar por nome, telefone ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="button" onClick={openCreate} disabled={busy}>
          Novo cliente
        </Button>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <Table>
        <THead>
          <tr>
            <Th>Nome</Th>
            <Th>Telefone</Th>
            <Th>Documento</Th>
            <Th className="text-right">Ações</Th>
          </tr>
        </THead>
        <TBody>
          {list.map((c) => (
            <Tr key={c.id}>
              <Td className="font-medium text-zinc-200">{c.name}</Td>
              <Td className="font-mono text-xs text-zinc-400">{c.phone ?? "—"}</Td>
              <Td className="font-mono text-xs text-zinc-400">{c.document ?? "—"}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-amber-400/90 hover:text-amber-300"
                    onClick={() => openEdit(c)}
                    disabled={busy}
                  >
                    Editar
                  </button>
                  {canReport ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-amber-400/90 hover:text-amber-300"
                      onClick={() => void openReport(c)}
                      disabled={busy}
                    >
                      Comandas
                    </button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setModal(null)}
        >
          <div
            className="my-8 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#1e1e1e]/95 p-6 shadow-2xl backdrop-blur-xl"
            role="dialog"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-100">{modal === "create" ? "Novo cliente" : "Editar cliente"}</h2>
            <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => void onSubmit(e)}>
              <Input label="Nome *" value={formName} onChange={(e) => setFormName(e.target.value)} required disabled={busy} />
              <Input label="Telefone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} disabled={busy} />
              <Input label="CPF / CNPJ" value={formDocument} onChange={(e) => setFormDocument(e.target.value)} disabled={busy} />
              <Input
                type="email"
                label="E-mail"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={busy}
              />
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
                Observações
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={busy}
                  className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none focus:ring-1 focus:ring-amber-500/30"
                />
              </label>
              {formError ? <p className="text-sm text-red-400">{formError}</p> : null}
              <div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4">
                <Button type="button" variant="outline" onClick={() => setModal(null)} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  Salvar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {reportFor && canReport ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setReportFor(null)}
        >
          <div
            className="my-8 w-full max-w-3xl rounded-xl border border-white/[0.1] bg-[#1e1e1e]/95 p-6 shadow-2xl backdrop-blur-xl"
            role="dialog"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-100">Comandas — {reportFor.name}</h2>
            <p className="mt-1 text-sm text-zinc-500">Comandas fechadas no período (vínculo por cliente cadastrado).</p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                De
                <input
                  type="date"
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
                  value={repFrom}
                  onChange={(e) => setRepFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Até
                <input
                  type="date"
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
                  value={repTo}
                  onChange={(e) => setRepTo(e.target.value)}
                />
              </label>
              <Button type="button" onClick={() => void loadReport()} disabled={reportLoading}>
                {reportLoading ? "Carregando…" : "Gerar"}
              </Button>
            </div>
            {reportData ? (
              <>
                <p className="mt-4 text-sm text-zinc-300">
                  Total no período: <strong className="text-amber-200/90">{money.format(reportData.total)}</strong> (
                  {reportData.orders.length} comandas)
                </p>
                <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-white/[0.08]">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-[#1a1a1a]">
                      <tr className="border-b border-white/[0.08] text-left text-[11px] uppercase text-zinc-500">
                        <th className="px-3 py-2">Fechamento</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Mesa / obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.orders.map((o) => (
                        <tr key={o.id} className="border-b border-white/[0.05] hover:bg-white/[0.03]">
                          <td className="px-3 py-2 text-zinc-400">{o.closedAt ? dt.format(new Date(o.closedAt)) : "—"}</td>
                          <td className="px-3 py-2 tabular-nums">{money.format(o.totalDue)}</td>
                          <td className="px-3 py-2 text-zinc-400">{o.clientName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            <div className="mt-6 flex justify-end border-t border-white/[0.08] pt-4">
              <Button type="button" variant="outline" onClick={() => setReportFor(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
