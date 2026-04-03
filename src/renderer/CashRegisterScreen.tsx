import { FormEvent, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowDownCircle, ArrowUpCircle, Banknote, PanelRightOpen } from "lucide-react";
import {
  apiCashAddMovement,
  apiCashClose,
  apiCashCurrent,
  apiCashHistory,
  apiCashMovements,
  apiCashOpen,
  type CashMovementRow,
  type CashSession,
  type CashShift,
  type User,
} from "./api";
import { CashSessionDetailModal } from "./components/CashSessionDetailModal";
import { DenominationModal } from "./components/DenominationModal";
import { useAuth } from "./AuthContext";
import { formatDigitsAsBRL, parseDigitsToReais } from "./lib/moneyInput";
import { reaisToCentDigits, sumDenominationMap } from "./lib/brlDenominations";
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

export function CashRegisterScreen({ onSessionChange }: { onSessionChange?: () => void }) {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const user = state.status === "authenticated" ? state.user : null;

  const [current, setCurrent] = useState<CashSession | null | undefined>(undefined);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [movements, setMovements] = useState<CashMovementRow[]>([]);
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
        const m = await apiCashMovements(token);
        setMovements(m);
      } else {
        setMovements([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar caixa");
      setCurrent(null);
      setMovements([]);
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

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-2 text-sm text-red-200">{error}</p>
      ) : null}

      {current === undefined ? (
        <p className="py-16 text-center text-sm text-zinc-500">Carregando…</p>
      ) : (
        <>
          {current ? (
        <section className="space-y-6">
          <Card className="overflow-hidden border-emerald-500/15 bg-[#1e1e1e]/90 backdrop-blur-md">
            <CardHeader>
              <CardTitle>Turno aberto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 !pt-0 text-sm">
              <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-100/90">
                <span className="font-medium">Aberto</span> em {dt.format(new Date(current.openedAt))} · Turno:{" "}
                <span className="text-emerald-50">{shiftLabel(current)}</span>
              </p>
              <p className="text-zinc-400">
                Operador: <span className="text-zinc-200">{current.openedBy.name}</span> ({current.openedBy.login})
              </p>
              <p className="text-zinc-300">
                Fundo inicial:{" "}
                <span className="font-semibold tabular-nums text-amber-200/90">{money.format(current.initialValue)}</span>
              </p>
              {current.openingNotes ? (
                <p className="rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-zinc-400">
                  <span className="text-[11px] uppercase text-zinc-500">Obs. abertura</span>
                  <br />
                  {current.openingNotes}
                </p>
              ) : null}
              <p className="font-mono text-[11px] text-zinc-500">Sessão ID: {current.id}</p>
            </CardContent>
          </Card>

          {canMove ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-white/[0.08] bg-[#1a1a1a]/80 backdrop-blur-sm">
                <CardHeader className="!py-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowDownCircle className="h-5 w-5 text-rose-400/90" strokeWidth={1.75} />
                    Sangria (retirada)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 !pt-0">
                  <p className="text-xs text-zinc-500">Retirada de numerário do caixa (ex.: pagamento ou cofre).</p>
                  <Input
                    label="Valor"
                    inputMode="numeric"
                    value={formatDigitsAsBRL(sangriaDigits)}
                    onChange={(e) => setSangriaDigits(e.target.value.replace(/\D/g, ""))}
                    disabled={busy}
                  />
                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Observação
                    <textarea
                      rows={2}
                      className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
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
              <Card className="border-white/[0.08] bg-[#1a1a1a]/80 backdrop-blur-sm">
                <CardHeader className="!py-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ArrowUpCircle className="h-5 w-5 text-sky-400/90" strokeWidth={1.75} />
                    Suprimento (entrada)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 !pt-0">
                  <p className="text-xs text-zinc-500">Entrada de troco ou reforço no caixa durante o turno.</p>
                  <Input
                    label="Valor"
                    inputMode="numeric"
                    value={formatDigitsAsBRL(supDigits)}
                    onChange={(e) => setSupDigits(e.target.value.replace(/\D/g, ""))}
                    disabled={busy}
                  />
                  <label className="flex flex-col gap-1 text-xs text-zinc-500">
                    Observação
                    <textarea
                      rows={2}
                      className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
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
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.05] py-2 last:border-0"
                    >
                      <span className={m.type === "SANGRIA" ? "text-rose-300/90" : "text-sky-300/90"}>
                        {m.type === "SANGRIA" ? "Sangria" : "Suprimento"} · {money.format(m.amount)}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {dt.format(new Date(m.createdAt))} · {m.createdBy.name}
                      </span>
                      {m.note ? <p className="w-full text-xs text-zinc-500">{m.note}</p> : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {canClose ? (
            <Card>
              <CardHeader className="!py-3">
                <CardTitle className="text-base">Fechar turno</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={(e) => void onClose(e)}>
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
            <p className="text-xs text-zinc-500">Sem permissão para fechar o caixa.</p>
          )}
        </section>
      ) : (
        <section className="mx-auto max-w-xl">
          {canOpen ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-b from-[#232323]/95 to-[#1a1a1a]/95 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(201,162,39,0.08),transparent_55%)]" />
              <div className="relative">
                <div className="mb-2 flex items-center gap-2 text-amber-200/90">
                  <Banknote className="h-6 w-6" strokeWidth={1.5} />
                  <h2 className="text-lg font-semibold text-zinc-100">Abertura de caixa</h2>
                </div>
                <p className="text-sm text-zinc-500">
                  Informe o fundo de troco, o turno e observações. Opcionalmente use a conferência de cédulas para conferência
                  detalhada.
                </p>
                <Button type="button" className="mt-6 w-full" onClick={() => setOpenModal(true)} disabled={busy}>
                  Iniciar formulário de abertura
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-500">Sem permissão para abrir o caixa.</p>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Últimos fechamentos (referência)</h2>
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]/50">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] bg-white/[0.03] text-left text-[11px] uppercase text-zinc-500">
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
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    Nenhum histórico fechado ainda.
                  </td>
                </tr>
              ) : (
                lastFiveClosed.map((s) => (
                  <tr
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer border-b border-white/[0.05] hover:bg-white/[0.06]"
                    onClick={() => setDetailSessionId(s.id)}
                    onKeyDown={(e) => onSessionRowKey(e, s.id)}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-400">
                      {s.closedAt ? dt.format(new Date(s.closedAt)) : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{money.format(s.initialValue)}</td>
                    <td className="px-3 py-2 tabular-nums text-zinc-400">
                      {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-zinc-500">{s.openedBy.name}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400/90">
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
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Histórico completo de sessões</h2>
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
                <Td colSpan={8} className="py-8 text-center text-zinc-500">
                  Nenhum registro ainda.
                </Td>
              </Tr>
            ) : (
              history.map((s) => (
                <Tr
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setDetailSessionId(s.id)}
                  onKeyDown={(e) => onSessionRowKey(e, s.id)}
                >
                  <Td className="whitespace-nowrap text-zinc-300">{dt.format(new Date(s.openedAt))}</Td>
                  <Td className="text-zinc-400">{shiftLabel(s)}</Td>
                  <Td className="whitespace-nowrap text-zinc-400">
                    {s.closedAt ? dt.format(new Date(s.closedAt)) : "—"}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{money.format(s.initialValue)}</Td>
                  <Td className="whitespace-nowrap tabular-nums text-zinc-400">
                    {s.closingBalance != null ? money.format(s.closingBalance) : "—"}
                  </Td>
                  <Td className="max-w-[120px] truncate text-zinc-400">{s.openedBy.name}</Td>
                  <Td className="max-w-[120px] truncate text-zinc-400">{s.closedBy?.name ?? "—"}</Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400/90">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => !busy && setOpenModal(false)}
        >
          <div
            role="dialog"
            aria-modal
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-[#1e1e1e]/95 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Abrir caixa</h3>
            <p className="mt-1 text-sm text-zinc-500">Preencha o turno e o valor inicial em gaveta.</p>
            <form className="mt-5 space-y-4" onSubmit={(e) => void onOpen(e)}>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
                Turno
                <select
                  className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
                  value={openShift}
                  onChange={(e) => setOpenShift(e.target.value as CashShift)}
                  disabled={busy}
                >
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
              <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
                Observações de abertura
                <textarea
                  rows={3}
                  className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  disabled={busy}
                  placeholder="Ex.: Entrada de moedas para troco solicitada"
                />
              </label>

              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">Valor inicial na gaveta</p>
                <div className="flex items-stretch gap-2 rounded-xl border border-amber-500/25 bg-[#141414] px-4 py-3 ring-1 ring-amber-500/10">
                  <span className="flex items-center text-2xl font-semibold text-amber-400/95">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums text-zinc-50 outline-none placeholder:text-zinc-600"
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
                  <p className="mt-2 text-[11px] text-emerald-400/90">
                    Conferência anexada ({money.format(sumDenominationMap(denomsSnapshot))})
                  </p>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4">
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
