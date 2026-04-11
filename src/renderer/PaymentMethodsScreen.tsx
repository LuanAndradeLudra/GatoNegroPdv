import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCommercialSettingsGet,
  apiCommercialSettingsPatch,
  apiCreatePaymentMethod,
  apiDatabaseBackup,
  apiDatabaseRestore,
  apiDeletePaymentMethod,
  apiListPaymentMethods,
  apiUpdatePaymentMethod,
  type CommercialChargeMode,
  type PaymentMethodKind,
  type PaymentMethodRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { cn } from "./lib/cn";
import { Button } from "./ui/Button";
import { Card, CardContent } from "./ui/Card";
import { Input } from "./ui/Input";
import { Table, TBody, Td, Th, THead, Tr } from "./ui/Table";

const KINDS: { value: PaymentMethodKind; label: string }[] = [
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "DEBITO", label: "Débito" },
  { value: "CREDITO", label: "Crédito" },
  { value: "VALE", label: "Vale" },
];

const KIND_LABEL: Record<PaymentMethodKind, string> = {
  DINHEIRO: "Dinheiro",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  VALE: "Vale",
};

const fieldSelectClass = cn(
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors",
  "focus:border-slate-900 focus:ring-2 focus:ring-slate-950/10",
  "dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/20",
);

export function PaymentMethodsScreen() {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const canEdit =
    state.status === "authenticated" &&
    (state.user.role === "ADMIN" || state.user.role === "GERENTE");
  const isAdmin = state.status === "authenticated" && state.user.role === "ADMIN";

  const [tab, setTab] = useState<"payments" | "commercial" | "backup">("payments");
  const [methods, setMethods] = useState<PaymentMethodRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cCouvertEn, setCCouvertEn] = useState(false);
  const [cCouvertMode, setCCouvertMode] = useState<CommercialChargeMode>("PERCENT");
  const [cCouvertVal, setCCouvertVal] = useState("0");
  const [cServEn, setCServEn] = useState(false);
  const [cServMode, setCServMode] = useState<CommercialChargeMode>("PERCENT");
  const [cServVal, setCServVal] = useState("0");

  const [name, setName] = useState("");
  const [kind, setKind] = useState<PaymentMethodKind>("DINHEIRO");
  const [feePercentStr, setFeePercentStr] = useState("");

  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const tabBtn = (active: boolean) =>
    cn(
      "rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "border-l-blue-600 bg-blue-50 text-blue-900 dark:border-l-blue-500 dark:bg-blue-950/40 dark:text-blue-100"
        : "border-l-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
    );

  const load = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const list = await apiListPaymentMethods(token, true);
      setMethods(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin && tab === "backup") {
      setTab("payments");
    }
  }, [isAdmin, tab]);

  const loadCommercial = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const s = await apiCommercialSettingsGet(token);
      setCCouvertEn(s.couvertEnabled);
      setCCouvertMode(s.couvertMode);
      setCCouvertVal(String(s.couvertValue));
      setCServEn(s.serviceFeeEnabled);
      setCServMode(s.serviceFeeMode);
      setCServVal(String(s.serviceFeeValue));
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    if (tab === "commercial") {
      void loadCommercial();
    }
  }, [tab, loadCommercial]);

  async function saveCommercial(e: FormEvent) {
    e.preventDefault();
    if (!token || !canEdit) {
      return;
    }
    const cv = Number.parseFloat(cCouvertVal.replace(",", "."));
    const sv = Number.parseFloat(cServVal.replace(",", "."));
    if (!Number.isFinite(cv) || cv < 0 || !Number.isFinite(sv) || sv < 0) {
      setError("Valores inválidos.");
      return;
    }
    if (cCouvertMode === "PERCENT" && cv > 100) {
      setError("Couvert % máximo 100.");
      return;
    }
    if (cServMode === "PERCENT" && sv > 100) {
      setError("Taxa de serviço % máximo 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCommercialSettingsPatch(token, {
        couvertEnabled: cCouvertEn,
        couvertMode: cCouvertMode,
        couvertValue: cv,
        serviceFeeEnabled: cServEn,
        serviceFeeMode: cServMode,
        serviceFeeValue: sv,
      });
      await loadCommercial();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !canEdit) {
      return;
    }
    const n = name.trim();
    if (!n) {
      setError("Informe o nome.");
      return;
    }
    const raw = feePercentStr.trim().replace(",", ".");
    let feePercent: number | null | undefined = undefined;
    if (raw !== "") {
      const v = Number.parseFloat(raw);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        setError("Taxa inválida (0–100%).");
        return;
      }
      feePercent = v;
    } else {
      feePercent = null;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCreatePaymentMethod(token, { name: n, kind, feePercent });
      setName("");
      setFeePercentStr("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(m: PaymentMethodRow) {
    if (!token || !canEdit) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiUpdatePaymentMethod(token, m.id, { active: !m.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: PaymentMethodRow) {
    if (!token || !canEdit) {
      return;
    }
    if (!window.confirm(`Desativar a forma "${m.name}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiDeletePaymentMethod(token, m.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao desativar");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8">
      <div className="border-b border-slate-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">PDV</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Configurações</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-zinc-400">
          Formas de pagamento e regras comerciais (couvert e taxa) aplicadas aos novos pedidos.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3 dark:border-zinc-800">
        <button type="button" className={tabBtn(tab === "payments")} onClick={() => setTab("payments")}>
          Formas de pagamento
        </button>
        <button type="button" className={tabBtn(tab === "commercial")} onClick={() => setTab("commercial")}>
          Couvert e taxa de serviço
        </button>
        {isAdmin ? (
          <button type="button" className={tabBtn(tab === "backup")} onClick={() => setTab("backup")}>
            Backup do banco
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {tab === "commercial" ? (
        <form
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40 dark:shadow-none"
          onSubmit={(e) => void saveCommercial(e)}
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Padrão para novos pedidos</h3>
          <p className="text-xs text-slate-600 dark:text-zinc-500">
            Percentual incide sobre o subtotal dos itens. Valor fixo em reais. No PDV você pode alterar por pedido antes de
            fechar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-zinc-300">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-zinc-600 dark:text-amber-500"
                  checked={cCouvertEn}
                  onChange={(e) => setCCouvertEn(e.target.checked)}
                  disabled={busy}
                />
                Couvert ativo por padrão
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                Modo
                <select
                  className={fieldSelectClass}
                  value={cCouvertMode}
                  onChange={(e) => setCCouvertMode(e.target.value as CommercialChargeMode)}
                  disabled={busy}
                >
                  <option value="PERCENT">Percentual</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                </select>
              </label>
              <Input
                label={cCouvertMode === "PERCENT" ? "Valor (%)" : "Valor (R$)"}
                inputMode="decimal"
                value={cCouvertVal}
                onChange={(e) => setCCouvertVal(e.target.value.replace(",", "."))}
                disabled={busy}
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
              <label className="flex items-center gap-2 text-sm text-slate-800 dark:text-zinc-300">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30 dark:border-zinc-600 dark:text-amber-500"
                  checked={cServEn}
                  onChange={(e) => setCServEn(e.target.checked)}
                  disabled={busy}
                />
                Taxa de serviço ativa por padrão
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                Modo
                <select
                  className={fieldSelectClass}
                  value={cServMode}
                  onChange={(e) => setCServMode(e.target.value as CommercialChargeMode)}
                  disabled={busy}
                >
                  <option value="PERCENT">Percentual</option>
                  <option value="FIXED">Valor fixo (R$)</option>
                </select>
              </label>
              <Input
                label={cServMode === "PERCENT" ? "Valor (%)" : "Valor (R$)"}
                inputMode="decimal"
                value={cServVal}
                onChange={(e) => setCServVal(e.target.value.replace(",", "."))}
                disabled={busy}
              />
            </div>
          </div>
          {canEdit ? (
            <Button type="submit" disabled={busy}>
              Salvar regras comerciais
            </Button>
          ) : (
            <p className="text-sm text-slate-500 dark:text-zinc-500">Apenas administrador ou gerente pode editar.</p>
          )}
        </form>
      ) : null}

      {tab === "payments" ? (
        <>
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Formas de pagamento</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-zinc-500">
              Cadastre bandeiras e meios (ex.: Visa crédito). A taxa % gera o valor líquido no fechamento (útil para conciliar
              com o extrato da maquininha).
            </p>
          </div>

          {canEdit ? (
            <form
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40 dark:shadow-none"
              onSubmit={(e) => void onCreate(e)}
            >
              <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Nova forma</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                  placeholder="Ex.: Visa Crédito"
                />
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-zinc-500">
                  Tipo
                  <select
                    className={fieldSelectClass}
                    value={kind}
                    onChange={(e) => setKind(e.target.value as PaymentMethodKind)}
                    disabled={busy}
                  >
                    {KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Input
                label="Taxa % (opcional)"
                inputMode="decimal"
                placeholder="Ex.: 3"
                value={feePercentStr}
                onChange={(e) => setFeePercentStr(e.target.value.replace(",", "."))}
                disabled={busy}
              />
              <Button type="submit" disabled={busy}>
                Cadastrar
              </Button>
            </form>
          ) : (
            <p className="text-sm text-slate-500 dark:text-zinc-500">Apenas administrador ou gerente pode cadastrar formas de pagamento.</p>
          )}

          <Card>
            <CardContent className="!p-0">
              <Table>
                <THead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Tipo</Th>
                    <Th>Taxa</Th>
                    <Th>Status</Th>
                    {canEdit ? <Th /> : null}
                  </tr>
                </THead>
                <TBody>
                  {methods.length === 0 ? (
                    <Tr>
                      <Td colSpan={canEdit ? 5 : 4} className="py-8 text-center text-slate-500 dark:text-zinc-500">
                        Nenhuma forma cadastrada.
                      </Td>
                    </Tr>
                  ) : (
                    methods.map((m) => (
                      <Tr key={m.id}>
                        <Td className="font-medium text-slate-900 dark:text-zinc-200">{m.name}</Td>
                        <Td className="text-slate-600 dark:text-zinc-400">{KIND_LABEL[m.kind]}</Td>
                        <Td className="tabular-nums text-slate-600 dark:text-zinc-400">
                          {m.feePercent != null ? `${m.feePercent}%` : "—"}
                        </Td>
                        <Td
                          className={
                            m.active
                              ? "font-medium text-emerald-700 dark:text-emerald-400/90"
                              : "text-slate-500 dark:text-zinc-500"
                          }
                        >
                          {m.active ? "Ativa" : "Inativa"}
                        </Td>
                        {canEdit ? (
                          <Td className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="!py-1 text-xs"
                                disabled={busy}
                                onClick={() => void toggleActive(m)}
                              >
                                {m.active ? "Desativar" : "Ativar"}
                              </Button>
                              <Button type="button" variant="danger" className="!py-1 text-xs" disabled={busy} onClick={() => void remove(m)}>
                                Excluir
                              </Button>
                            </div>
                          </Td>
                        ) : null}
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}

      {tab === "backup" && isAdmin ? (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/40 dark:shadow-none">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Backup e restauração</h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-zinc-400">
              Gera um dump SQL do PostgreSQL na pasta <code className="rounded bg-slate-100 px-1 text-xs dark:bg-zinc-800">data/backups</code>{" "}
              (no servidor), com nome de pasta <span className="whitespace-nowrap">dia_mês_ano_horaminutosegundo</span> (ex.:{" "}
              <span className="whitespace-nowrap">11_04_2026_143052</span>). A restauração substitui o conteúdo atual do banco pelo arquivo
              escolhido (SQL gerado por este PDV ou dump custom do <span className="whitespace-nowrap">pg_restore</span>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  if (!token) {
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  setBackupMsg(null);
                  try {
                    const r = await apiDatabaseBackup(token);
                    setBackupMsg(`Backup salvo em: ${r.directory}/${r.fileName}`);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Erro no backup");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Gerar backup agora
            </Button>
          </div>
          {backupMsg ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
              {backupMsg}
            </p>
          ) : null}

          <div className="border-t border-slate-200 pt-6 dark:border-zinc-700">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-200">Restaurar banco</h4>
            <p className="mt-1 text-xs text-slate-600 dark:text-zinc-500">
              Escolha um arquivo <code className="rounded bg-slate-100 px-1 dark:bg-zinc-800">dump.sql</code> deste sistema ou um backup no formato
              custom do PostgreSQL. Todos os usuários conectados podem precisar fazer login de novo.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                <input
                  type="file"
                  className="sr-only"
                  accept=".sql,.dump,.backup"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setRestoreFile(f ?? null);
                  }}
                />
                Selecionar arquivo
              </label>
              {restoreFile ? (
                <span className="text-sm text-slate-600 dark:text-zinc-400">{restoreFile.name}</span>
              ) : (
                <span className="text-sm text-slate-500 dark:text-zinc-500">Nenhum arquivo</span>
              )}
              <Button
                type="button"
                variant="danger"
                disabled={busy || !restoreFile}
                onClick={() => {
                  if (!token || !restoreFile) {
                    return;
                  }
                  if (
                    !window.confirm(
                      "A restauração substitui os dados atuais do banco pelo conteúdo do arquivo. Esta ação não pode ser desfeita. Continuar?",
                    )
                  ) {
                    return;
                  }
                  if (!window.confirm("Confirma restauração? O sistema ficará inconsistente até você recarregar a página.")) {
                    return;
                  }
                  void (async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const r = await apiDatabaseRestore(token, restoreFile);
                      setBackupMsg(r.message);
                      setRestoreFile(null);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Erro ao restaurar");
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                Restaurar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
