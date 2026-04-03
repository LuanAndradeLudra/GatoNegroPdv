import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  apiCommercialSettingsGet,
  apiCommercialSettingsPatch,
  apiCreatePaymentMethod,
  apiDeletePaymentMethod,
  apiListPaymentMethods,
  apiUpdatePaymentMethod,
  type CommercialChargeMode,
  type PaymentMethodKind,
  type PaymentMethodRow,
} from "./api";
import { useAuth } from "./AuthContext";
import { Button } from "./ui/Button";
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

export function PaymentMethodsScreen() {
  const { state } = useAuth();
  const token = state.status === "authenticated" ? state.token : null;
  const canEdit =
    state.status === "authenticated" &&
    (state.user.role === "ADMIN" || state.user.role === "GERENTE");

  const [tab, setTab] = useState<"payments" | "commercial">("payments");
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
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <div>
        <h2 className="text-base font-semibold text-zinc-200">Configurações do PDV</h2>
        <p className="mt-1 text-sm text-zinc-500">Formas de pagamento e regras comerciais aplicadas aos novos pedidos.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] pb-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "payments" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300"}`}
          onClick={() => setTab("payments")}
        >
          Formas de pagamento
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === "commercial" ? "bg-amber-500/15 text-amber-100" : "text-zinc-500 hover:text-zinc-300"}`}
          onClick={() => setTab("commercial")}
        >
          Couvert e taxa de serviço
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-950/40 px-4 py-2 text-sm text-red-200">{error}</p>
      ) : null}

      {tab === "commercial" ? (
        <form className="space-y-4 rounded-xl border border-white/[0.08] bg-[#1a1a1a]/60 p-5" onSubmit={(e) => void saveCommercial(e)}>
          <h3 className="text-sm font-medium text-zinc-300">Padrão para novos pedidos</h3>
          <p className="text-xs text-zinc-500">
            Percentual incide sobre o subtotal dos itens. Valor fixo em reais. No PDV você pode alterar por pedido antes de
            fechar.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-white/[0.06] p-3">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={cCouvertEn} onChange={(e) => setCCouvertEn(e.target.checked)} disabled={busy} />
                Couvert ativo por padrão
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Modo
                <select
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
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
            <div className="space-y-2 rounded-lg border border-white/[0.06] p-3">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={cServEn} onChange={(e) => setCServEn(e.target.checked)} disabled={busy} />
                Taxa de serviço ativa por padrão
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Modo
                <select
                  className="rounded-lg border border-white/10 bg-[#141414] px-2 py-2 text-sm text-zinc-100"
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
            <p className="text-sm text-zinc-500">Apenas administrador ou gerente pode editar.</p>
          )}
        </form>
      ) : null}

      {tab === "payments" ? (
        <>
      <div>
        <h3 className="text-sm font-semibold text-zinc-300">Formas de pagamento</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Cadastre bandeiras e meios (ex.: Visa crédito). A taxa % gera o valor líquido no fechamento (útil para conciliar
          com o extrato da maquininha).
        </p>
      </div>

      {canEdit ? (
        <form className="space-y-4 rounded-xl border border-white/[0.08] bg-[#1a1a1a]/60 p-5" onSubmit={(e) => void onCreate(e)}>
          <h3 className="text-sm font-medium text-zinc-300">Nova forma</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="Ex.: Visa Crédito" />
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Tipo
              <select
                className="rounded-lg border border-white/10 bg-[#141414] px-3 py-2 text-sm text-zinc-100"
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
        <p className="text-sm text-zinc-500">Apenas administrador ou gerente pode cadastrar formas de pagamento.</p>
      )}

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
              <Td colSpan={canEdit ? 5 : 4} className="py-8 text-center text-zinc-500">
                Nenhuma forma cadastrada.
              </Td>
            </Tr>
          ) : (
            methods.map((m) => (
              <Tr key={m.id}>
                <Td className="font-medium text-zinc-200">{m.name}</Td>
                <Td className="text-zinc-400">{KIND_LABEL[m.kind]}</Td>
                <Td className="tabular-nums text-zinc-400">{m.feePercent != null ? `${m.feePercent}%` : "—"}</Td>
                <Td className={m.active ? "text-emerald-400/90" : "text-zinc-500"}>{m.active ? "Ativa" : "Inativa"}</Td>
                {canEdit ? (
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" className="!py-1 text-xs" disabled={busy} onClick={() => void toggleActive(m)}>
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
        </>
      ) : null}
    </div>
  );
}
