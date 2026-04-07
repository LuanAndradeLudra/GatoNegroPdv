import { FormEvent, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowDownCircle, ArrowUpCircle, Banknote, CreditCard, PanelRightOpen } from "lucide-react";
import {
  apiCashAddMovement,
  apiCashClose,
  apiCashCurrent,
  apiCashHistory,
  apiCashMovements,
  apiCashOpen,
  apiCashOpenSessionSales,
  type CashMovementRow,
  type CashOpenSessionSales,
  type CashSession,
  type CashShift,
  type PaymentMethodKind,
  type User,
} from "./api";
import { CashSessionDetailModal } from "./components/CashSessionDetailModal";
import { DenominationModal } from "./components/DenominationModal";
import { useAuth } from "./AuthContext";
import { formatDigitsAsBRL, parseDigitsToReais } from "./lib/moneyInput";
import { reaisToCentDigits, sumDenominationMap } from "./lib/brlDenominations";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const SHIFTS: { value: CashShift; label: string }[] = [
  { value: "MANHA", label: "Manhã" },
  { value: "TARDE", label: "Tarde" },
  { value: "NOITE", label: "Noite" },
  { value: "CUSTOM", label: "Personalizado" },
];

/** Textarea alinhada ao Input (light + dark). */
const textareaClass = cn(
  "min-h-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors",
  "placeholder:text-slate-400 focus:border-slate-900 focus:ring-[3px] focus:ring-slate-950/5",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500 dark:focus:ring-blue-500/20",
);

const selectClass = cn(
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-colors",
  "focus:border-slate-900 focus:ring-[3px] focus:ring-slate-950/5 disabled:cursor-not-allowed disabled:opacity-50",
  "dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/20",
);

function hasVendas(user: User, action: "abrir" | "fechar"): boolean {
  return user.permissions.VENDAS.includes(action);
}

function shiftLabel(s: CashSession): string {
  if (s.shift === "CUSTOM") {
    return s.shiftCustomLabel?.trim() || "Personalizado";
  }
  const m: Record<CashShift, string> = {
    MANHA: "Manhã",
    TARDE: "Tarde",
    NOITE: "Noite",
    CUSTOM: "Personalizado",
  };
  return m[s.shift] ?? s.shift;
}

const PAYMENT_KIND_LABEL: Record<PaymentMethodKind, string> = {
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  VALE: "Vale / outro",
};

export function CashRegisterScreen({ onSessionChange }: { onSessionChange?: () => void }) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const user = state.status === "authenticated" ? state.user : null;

  const [current, setCurrent] = useState<CashSession | null | undefined>(undefined);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovementRow[]>([]);
  const [sessionSales, setSessionSales] = useState<CashOpenSessionSales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [openDigits, setOpenDigits] = useState("");
  const [closeDigits, setCloseDigits] = useState("");
  const [openShift, setOpenShift] = useState<CashShift>("MANHA");
  const [openShiftCustom, setOpenShiftCustom] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [denomsSnapshot, setDenomsSnapshot] = useState<Record<string, number> | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [showDenomModal, setShowDenomModal] = useState(false);

  const [detailSessionId, setDetailSessionId] = useState<string | null>(null);

  const [sangriaDigits, setSangriaDigits] = useState("");
  const [sangriaNote, setSangriaNote] = useState("");
  const [supDigits, setSupDigits] = useState("");
  const [supNote, setSupNote] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const [c, h] = await Promise.all([apiCashCurrent(token), apiCashHistory(token, 40)]);
      setCurrent(c);
      setHistory(h);
      if (c) {
        const [m, sales] = await Promise.all([apiCashMovements(token), apiCashOpenSessionSales(token)]);
        setMovements(m);
        setSessionSales(sales);
      } else {
        setMovements([]);
        setSessionSales(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar caixa");
      setCurrent(null);
      setMovements([]);
      setSessionSales(null);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (openModal) {
      setOpenDigits("");
      setOpenShift("MANHA");
      setOpenShiftCustom("");
      setOpenNotes("");
      setDenomsSnapshot(null);
    }
  }, [openModal]);

  const lastFiveClosed = useMemo(
    () => history.filter((s) => s.closedAt).slice(0, 5),
    [history],
  );

  function onSessionRowKey(e: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDetailSessionId(id);
    }
  }

  async function onOpen(e: FormEvent) {
    e.preventDefault();
    if (!token || !user) {
      return;
    }
    const n = parseDigitsToReais(openDigits);
    if (n === null || n < 0) {
      setError("Informe um valor inicial válido.");
      return;
    }
    if (openShift === "CUSTOM" && !openShiftCustom.trim()) {
      setError("Informe o nome do turno personalizado.");
      return;
    }
    if (denomsSnapshot && Math.abs(sumDenominationMap(denomsSnapshot) - n) > 0.02) {
      setError("O valor digitado não confere com a última conferência de cédulas. Ajuste ou use só um dos métodos.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCashOpen(token, {
        initialValue: n,
        shift: openShift,
        shiftCustomLabel: openShift === "CUSTOM" ? openShiftCustom.trim() : null,
        openingNotes: openNotes.trim() || null,
        denominations: denomsSnapshot && Object.keys(denomsSnapshot).length > 0 ? denomsSnapshot : null,
      });
      setOpenDigits("");
      setOpenModal(false);
      await load();
      onSessionChange?.();
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
      const rawDigits = closeDigits.replace(/\D/g, "");
      let closing: number | null | undefined = undefined;
      if (rawDigits !== "") {
        const n = parseDigitsToReais(closeDigits);
        if (n === null || n < 0) {
          setError("Valor de fechamento inválido.");
          setBusy(false);
          return;
        }
        closing = n;
      }
      await apiCashClose(token, closing);
      setCloseDigits("");
      await load();
      onSessionChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fechar");
    } finally {
      setBusy(false);
    }
  }

  async function submitMovement(type: "SANGRIA" | "SUPRIMENTO", digits: string, note: string, clear: () => void) {
    if (!token) {
      return;
    }
    const n = parseDigitsToReais(digits);
    if (n === null || n <= 0) {
      setError("Informe um valor válido (> 0).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCashAddMovement(token, { type, amount: n, note: note.trim() || null });
      clear();
      await load();
      onSessionChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setBusy(false);
    }
  }

  if (!token || !user) {
    return null;
  }

  const canOpen = hasVendas(user, "abrir");
  const canClose = hasVendas(user, "fechar");
  const canMove = canOpen;

  const muted = "text-slate-500 dark:text-zinc-500";
  const labelUpper = "text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {current === undefined ? (
        <p className={cn("py-16 text-center text-sm", muted)}>Carregando…</p>
      ) : (
        <>
          {current ? (
            <section className="space-y-6">
              <Card className="overflow-hidden border-emerald-200/90 bg-emerald-50/40 dark:border-emerald-900/45 dark:bg-emerald-950/25">
                <CardHeader>
                  <CardTitle>Turno aberto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 !pt-0 text-sm">
                  <p className="rounded-lg border border-emerald-200 bg-white/80 mt-4 px-3 py-2 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-100">
                    <span className="font-semibold">Aberto</span> em {dt.format(new Date(current.openedAt))} · Turno:{" "}
                    <span className="text-emerald-800 dark:text-emerald-200">{shiftLabel(current)}</span>
                  </p>
                  <p className={cn(muted)}>
                    Operador: <span className="font-medium text-slate-800 dark:text-zinc-200">{current.openedBy.name}</span> (
                    {current.openedBy.login})
                  </p>
                  <p className="text-slate-700 dark:text-zinc-300">
                    Fundo inicial:{" "}
                    <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{money.format(current.initialValue)}</span>
                  </p>
                  {current.openingNotes ? (
                    <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                      <span className="text-[11px] font-medium uppercase text-slate-500 dark:text-zinc-500">Obs. abertura</span>
                      <br />
                      {current.openingNotes}
                    </p>
                  ) : null}
                  <p className="font-mono text-[11px] text-slate-400 dark:text-zinc-600">Sessão ID: {current.id}</p>
                </CardContent>
              </Card>

              {canMove ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-rose-100 dark:border-rose-900/35">
                    <CardHeader className="!py-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ArrowDownCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" strokeWidth={1.75} />
                        Sangria (retirada)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 !pt-0 mt-4">
                      <p className={cn("text-xs", muted)}>Retirada de numerário do caixa (ex.: pagamento ou cofre).</p>
                      <Input
                        label="Valor"
                        inputMode="numeric"
                        value={formatDigitsAsBRL(sangriaDigits)}
                        onChange={(e) => setSangriaDigits(e.target.value.replace(/\D/g, ""))}
                        disabled={busy}
                      />
                      <label className={cn("flex flex-col gap-1 text-xs font-medium", muted)}>
                        Observação
                        <textarea
                          rows={2}
                          className={textareaClass}
                          value={sangriaNote}
                          onChange={(e) => setSangriaNote(e.target.value)}
                          disabled={busy}
                          placeholder="Opcional"
                        />
                      </label>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full"
                        disabled={busy}
                        onClick={() =>
                          void submitMovement("SANGRIA", sangriaDigits, sangriaNote, () => {
                            setSangriaDigits("");
                            setSangriaNote("");
                          })
                        }
                      >
                        Registrar sangria
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="border-sky-100 dark:border-sky-900/35">
                    <CardHeader className="!py-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <ArrowUpCircle className="h-5 w-5 text-sky-600 dark:text-sky-400" strokeWidth={1.75} />
                        Suprimento (entrada)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 !pt-0 mt-4">
                      <p className={cn("text-xs", muted)}>Entrada de troco ou reforço no caixa durante o turno.</p>
                      <Input
                        label="Valor"
                        inputMode="numeric"
                        value={formatDigitsAsBRL(supDigits)}
                        onChange={(e) => setSupDigits(e.target.value.replace(/\D/g, ""))}
                        disabled={busy}
                      />
                      <label className={cn("flex flex-col gap-1 text-xs font-medium", muted)}>
                        Observação
                        <textarea
                          rows={2}
                          className={textareaClass}
                          value={supNote}
                          onChange={(e) => setSupNote(e.target.value)}
                          disabled={busy}
                          placeholder="Opcional"
                        />
                      </label>
                      <Button
                        type="button"
                        className="w-full"
                        disabled={busy}
                        onClick={() =>
                          void submitMovement("SUPRIMENTO", supDigits, supNote, () => {
                            setSupDigits("");
                            setSupNote("");
                          })
                        }
                      >
                        Registrar suprimento
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              ) : null}

              {movements.length > 0 ? (
                <Card>
                  <CardHeader className="!py-3">
                    <CardTitle className="text-base">Movimentações do turno</CardTitle>
                  </CardHeader>
                  <CardContent className="!pt-0">
                    <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                      {movements.map((m) => (
                        <li
                          key={m.id}
                          className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 py-2 last:border-0 dark:border-zinc-800"
                        >
                          <span
                            className={
                              m.type === "SANGRIA"
                                ? "font-medium text-rose-700 dark:text-rose-300"
                                : "font-medium text-sky-700 dark:text-sky-300"
                            }
                          >
                            {m.type === "SANGRIA" ? "Sangria" : "Suprimento"} · {money.format(m.amount)}
                          </span>
                          <span className={cn("text-[11px]", muted)}>
                            {dt.format(new Date(m.createdAt))} · {m.createdBy.name}
                          </span>
                          {m.note ? <p className={cn("w-full text-xs", muted)}>{m.note}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}

              {sessionSales && current ? (
                <Card className="border-amber-200/80 dark:border-amber-900/40">
                  <CardHeader className="!py-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CreditCard className="h-5 w-5 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
                      Vendas do turno (conferência)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="!pt-0 mt-2 space-y-4 text-sm">
                    <p className={cn("text-xs leading-relaxed", muted)}>
                      Totais das vendas já finalizadas neste caixa, somando o valor bruto informado em cada parcela no PDV. Útil para
                      bater com maquininhas, conferência de dinheiro e fechamento.
                    </p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/60">
                      <p className="text-slate-700 dark:text-zinc-300">
                        <span className={labelUpper}>Pedidos fechados</span>
                        <span className="ml-2 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                          {sessionSales.ordersClosedCount}
                        </span>
                      </p>
                      <p className="text-slate-700 dark:text-zinc-300">
                        <span className={labelUpper}>Parcelas registradas</span>
                        <span className="ml-2 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                          {sessionSales.paymentLinesCount}
                        </span>
                      </p>
                      <p className="text-slate-700 dark:text-zinc-300">
                        <span className={labelUpper}>Total vendido</span>
                        <span className="ml-2 font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                          {money.format(sessionSales.totalAmount)}
                        </span>
                      </p>
                    </div>
                    {sessionSales.byMethod.length === 0 ? (
                      <p className={cn("rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm", muted)}>
                        Nenhuma venda fechada neste turno ainda.
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-700">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
                              <th className="px-3 py-2">Forma de pagamento</th>
                              <th className="px-3 py-2">Tipo</th>
                              <th className="px-3 py-2 text-right">Parcelas</th>
                              <th className="px-3 py-2 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionSales.byMethod.map((row) => (
                              <tr
                                key={row.paymentMethodId}
                                className="border-b border-slate-100 last:border-0 dark:border-zinc-800/80"
                              >
                                <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-zinc-100">{row.name}</td>
                                <td className={cn("px-3 py-2.5", muted)}>{PAYMENT_KIND_LABEL[row.kind] ?? row.kind}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-zinc-400">
                                  {row.linesCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                                  {money.format(row.totalAmount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-amber-50/80 font-semibold dark:bg-amber-950/25">
                              <td className="px-3 py-2.5 text-slate-800 dark:text-zinc-200" colSpan={2}>
                                Total
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-zinc-300">
                                {sessionSales.paymentLinesCount}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-amber-800 dark:text-amber-200">
                                {money.format(sessionSales.totalAmount)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {canClose ? (
                <Card>
                  <CardHeader className="!py-3">
                    <CardTitle className="text-base">Fechar turno</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form className="space-y-3 mt-4" onSubmit={(e) => void onClose(e)}>
                      <Input
                        label="Valor contado no fechamento (opcional)"
                        inputMode="numeric"
                        placeholder="0,00"
                        autoComplete="off"
                        value={formatDigitsAsBRL(closeDigits)}
                        onChange={(e) => setCloseDigits(e.target.value.replace(/\D/g, ""))}
                        disabled={busy}
                      />
                      <Button type="submit" className="w-full" variant="outline" disabled={busy}>
                        {busy ? "Fechando…" : "Fechar caixa"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <p className={cn("text-xs", muted)}>Sem permissão para fechar o caixa.</p>
              )}
            </section>
          ) : (
            <section className="mx-auto max-w-xl">
              {canOpen ? (
                <Card className="relative overflow-hidden border-slate-200/90 p-8 shadow-md dark:border-zinc-700 dark:shadow-none">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(37,99,235,0.06),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.12),transparent_55%)]" />
                  <div className="relative">
                    <div className="mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                      <Banknote className="h-6 w-6" strokeWidth={1.5} />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Abertura de caixa</h2>
                    </div>
                    <p className={cn("text-sm", muted)}>
                      Informe o fundo de troco, o turno e observações. Opcionalmente use a conferência de cédulas para conferência
                      detalhada.
                    </p>
                    <Button type="button" className="mt-6 w-full" onClick={() => setOpenModal(true)} disabled={busy}>
                      Iniciar formulário de abertura
                    </Button>
                  </div>
                </Card>
              ) : (
                <p className={cn("text-center text-sm", muted)}>Sem permissão para abrir o caixa.</p>
              )}
            </section>
          )}

          <section>
            <h2 className={cn("mb-3", labelUpper)}>Últimos fechamentos (referência)</h2>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/90 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-400">
                    <th className="px-3 py-2">Fechamento</th>
                    <th className="px-3 py-2">Inicial</th>
                    <th className="px-3 py-2">Contado</th>
                    <th className="px-3 py-2">Operador</th>
                    <th className="px-3 py-2 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {lastFiveClosed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={cn("px-3 py-6 text-center", muted)}>
                        Nenhum histórico fechado ainda.
                      </td>
                    </tr>
                  ) : (
                    lastFiveClosed.map((s) => (
                      <tr
                        key={s.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80"
                        onClick={() => setDetailSessionId(s.id)}
                        onKeyDown={(e) => onSessionRowKey(e, s.id)}
                      >
                        <td className={cn("whitespace-nowrap px-3 py-2", muted)}>
                          {s.closedAt ? dt.format(new Date(s.closedAt)) : "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-slate-900 dark:text-zinc-100">{money.format(s.initialValue)}</td>
                        <td className={cn("px-3 py-2 tabular-nums", muted)}>
                          {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                        </td>
                        <td className={cn("max-w-[120px] truncate px-3 py-2", muted)}>{s.openedBy.name}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                            <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                            Detalhes
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className={cn("mb-3", labelUpper)}>Histórico completo de sessões</h2>
            <Table>
              <THead>
                <tr>
                  <Th>Abertura</Th>
                  <Th>Turno</Th>
                  <Th>Fechamento</Th>
                  <Th>Inicial</Th>
                  <Th>Contado</Th>
                  <Th>Aberto por</Th>
                  <Th>Fechado por</Th>
                  <Th className="text-right"> </Th>
                </tr>
              </THead>
              <TBody>
                {history.length === 0 ? (
                  <Tr>
                    <Td colSpan={8} className={cn("py-8 text-center", muted)}>
                      Nenhum registro ainda.
                    </Td>
                  </Tr>
                ) : (
                  history.map((s) => (
                    <Tr
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-800/60"
                      onClick={() => setDetailSessionId(s.id)}
                      onKeyDown={(e) => onSessionRowKey(e, s.id)}
                    >
                      <Td className="whitespace-nowrap text-slate-800 dark:text-zinc-200">{dt.format(new Date(s.openedAt))}</Td>
                      <Td className={muted}>{shiftLabel(s)}</Td>
                      <Td className={cn("whitespace-nowrap", muted)}>
                        {s.closedAt ? dt.format(new Date(s.closedAt)) : "—"}
                      </Td>
                      <Td className="whitespace-nowrap tabular-nums text-slate-900 dark:text-zinc-100">{money.format(s.initialValue)}</Td>
                      <Td className={cn("whitespace-nowrap tabular-nums", muted)}>
                        {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                      </Td>
                      <Td className={cn("max-w-[120px] truncate", muted)}>{s.openedBy.name}</Td>
                      <Td className={cn("max-w-[120px] truncate", muted)}>{s.closedBy?.name ?? "—"}</Td>
                      <Td className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                          <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
                          Detalhes
                        </span>
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </section>
        </>
      )}

      {openModal && canOpen && current === null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] dark:bg-black/55"
          role="presentation"
          onClick={() => !busy && setOpenModal(false)}
        >
          <div
            role="dialog"
            aria-modal
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-zinc-100">Abrir caixa</h3>
            <p className={cn("mt-1 text-sm", muted)}>Preencha o turno e o valor inicial em gaveta.</p>
            <form className="mt-5 space-y-4" onSubmit={(e) => void onOpen(e)}>
              <label className={cn("flex flex-col gap-1.5 text-xs font-semibold", muted)}>
                Turno
                <select className={selectClass} value={openShift} onChange={(e) => setOpenShift(e.target.value as CashShift)} disabled={busy}>
                  {SHIFTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              {openShift === "CUSTOM" ? (
                <Input
                  label="Nome do turno"
                  value={openShiftCustom}
                  onChange={(e) => setOpenShiftCustom(e.target.value)}
                  disabled={busy}
                  placeholder="Ex.: Evento / feriado"
                />
              ) : null}
              <label className={cn("flex flex-col gap-1.5 text-xs font-semibold", muted)}>
                Observações de abertura
                <textarea
                  rows={3}
                  className={textareaClass}
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  disabled={busy}
                  placeholder="Ex.: Entrada de moedas para troco solicitada"
                />
              </label>

              <div>
                <p className={cn("mb-2 text-xs font-semibold", muted)}>Valor inicial na gaveta</p>
                <div className="flex items-stretch gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 ring-1 ring-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:ring-amber-900/40">
                  <span className="flex items-center text-2xl font-semibold text-amber-700 dark:text-amber-400">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 dark:text-zinc-50 dark:placeholder:text-zinc-600"
                    placeholder="0,00"
                    value={formatDigitsAsBRL(openDigits)}
                    onChange={(e) => {
                      setOpenDigits(e.target.value.replace(/\D/g, ""));
                      setDenomsSnapshot(null);
                    }}
                    disabled={busy}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full !py-2 text-xs"
                  disabled={busy}
                  onClick={() => setShowDenomModal(true)}
                >
                  Conferir cédulas e moedas (opcional)
                </Button>
                {denomsSnapshot && Object.keys(denomsSnapshot).length > 0 ? (
                  <p className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Conferência anexada ({money.format(sumDenominationMap(denomsSnapshot))})
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-zinc-700">
                <Button type="button" variant="outline" onClick={() => setOpenModal(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Abrindo…" : "Confirmar abertura"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <DenominationModal
        open={showDenomModal}
        onClose={() => setShowDenomModal(false)}
        onApply={(denoms, totalReais) => {
          setOpenDigits(reaisToCentDigits(totalReais));
          setDenomsSnapshot(denoms);
        }}
      />

      <CashSessionDetailModal
        open={detailSessionId != null}
        sessionId={detailSessionId}
        token={token}
        onClose={() => setDetailSessionId(null)}
      />
    </div>
  );
}
