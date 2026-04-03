import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCreateCustomer,
  apiCustomerOrdersReport,
  apiListCustomers,
  apiUpdateCustomer,
  type CustomerRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const searchInputClass = cn(
  "w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors",
  "placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20",
  "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-amber-500/50 dark:focus:ring-amber-500/25",
);

const textareaClass = cn(
  "min-h-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors",
  "placeholder:text-slate-400 focus:border-slate-900 focus:ring-[3px] focus:ring-slate-950/5",
  "dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/20",
);

const dateInputClass = cn(
  "rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 outline-none",
  "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100",
);

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
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
      <div className="border-b border-slate-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Cadastros</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Clientes</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-zinc-400">
          Busque por nome, telefone ou documento. Use &quot;Comandas&quot; para ver pedidos fechados vinculados ao cliente.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <input
          type="search"
          className={searchInputClass}
          placeholder="Buscar por nome, telefone ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="button" onClick={openCreate} disabled={busy}>
          Novo cliente
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="!p-0">
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
                  <Td className="font-medium text-slate-900 dark:text-zinc-100">{c.name}</Td>
                  <Td className="font-mono text-xs text-slate-600 dark:text-zinc-400">{c.phone ?? "—"}</Td>
                  <Td className="font-mono text-xs text-slate-600 dark:text-zinc-400">{c.document ?? "—"}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        onClick={() => openEdit(c)}
                        disabled={busy}
                      >
                        Editar
                      </button>
                      {canReport ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-violet-700 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300"
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
        </CardContent>
      </Card>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
          role="presentation"
          onClick={() => setModal(null)}
        >
          <div
            className="my-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">
              {modal === "create" ? "Novo cliente" : "Editar cliente"}
            </h2>
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
              <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                Observações
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  disabled={busy}
                  className={textareaClass}
                />
              </label>
              {formError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
              ) : null}
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
          role="presentation"
          onClick={() => setReportFor(null)}
        >
          <div
            className="my-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            role="dialog"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Comandas — {reportFor.name}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
              Comandas fechadas no período (vínculo por cliente cadastrado).
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                De
                <input type="date" className={dateInputClass} value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                Até
                <input type="date" className={dateInputClass} value={repTo} onChange={(e) => setRepTo(e.target.value)} />
              </label>
              <Button type="button" onClick={() => void loadReport()} disabled={reportLoading}>
                {reportLoading ? "Carregando…" : "Gerar"}
              </Button>
            </div>
            {reportData ? (
              <>
                <p className="mt-4 text-sm text-slate-700 dark:text-zinc-300">
                  Total no período:{" "}
                  <strong className="text-amber-800 dark:text-amber-200/90">{money.format(reportData.total)}</strong> (
                  {reportData.orders.length} comandas)
                </p>
                <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-zinc-700">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-800">
                      <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-zinc-700 dark:text-zinc-400">
                        <th className="px-3 py-2">Fechamento</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Mesa / obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.orders.map((o) => (
                        <tr
                          key={o.id}
                          className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                        >
                          <td className="px-3 py-2 text-slate-600 dark:text-zinc-400">
                            {o.closedAt ? dt.format(new Date(o.closedAt)) : "—"}
                          </td>
                          <td className="px-3 py-2 tabular-nums font-medium text-slate-900 dark:text-zinc-100">
                            {money.format(o.totalDue)}
                          </td>
                          <td className="px-3 py-2 text-slate-600 dark:text-zinc-400">{o.clientName ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            <div className="mt-6 flex justify-end border-t border-slate-200 pt-4 dark:border-zinc-700">
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
