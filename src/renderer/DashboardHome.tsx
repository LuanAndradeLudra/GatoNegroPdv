import {
  ChefHat,
  CreditCard,
  LineChart,
  ShoppingCart,
  UserCog,
  UsersRound,
  Wallet,
  Building2,
  Store,
  ClipboardList,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiPdvStatsToday, type User } from "./api";
import { Card, CardContent } from "./ui/Card";
import { cn } from "./lib/cn";
import type { ShellView } from "./components/AppShell";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type QuickItem = {
  id: ShellView;
  label: string;
  description: string;
  icon: typeof Wallet;
  accent?: boolean;
};

const QUICK: QuickItem[] = [
  { id: "caixa", label: "Caixa", description: "Abrir, fechar e histórico", icon: Wallet, accent: true },
  { id: "pdv", label: "Nova venda", description: "Balcão e comandas", icon: ShoppingCart, accent: true },
  { id: "erp", label: "ERP", description: "Estoque e cadastros", icon: Building2 },
  { id: "financeiro", label: "Financeiro", description: "Fluxo de caixa e relatórios", icon: LineChart },
  { id: "users", label: "Usuários", description: "Papéis e permissões", icon: UserCog },
  { id: "cozinha", label: "Cozinha", description: "Fila de preparo", icon: ChefHat },
  { id: "clientes", label: "Clientes", description: "Cadastro e relatórios", icon: UsersRound },
];

export function DashboardHome({
  user,
  token,
  access,
  cashOpen,
  onNavigate,
  onPdvShortcut,
}: {
  user: User;
  token: string;
  access: User["access"];
  /** `null` enquanto carrega; PDV exige `true` */
  cashOpen: boolean | null;
  onNavigate: (v: ShellView) => void;
  onPdvShortcut: (mode: "direct" | "comanda") => void;
}) {
  const [stats, setStats] = useState<{ closedTodayTotal: number; closedTodayCount: number; openComandasCount: number } | null>(
    null,
  );
  const [statsErr, setStatsErr] = useState<string | null>(null);

  const pdvReady = access.pdv && cashOpen === true;
  const pdvBlocked = access.pdv && cashOpen === false;
  const pdvLoading = access.pdv && cashOpen === null;

  useEffect(() => {
    if (!access.pdv) {
      return;
    }
    let cancelled = false;
    void apiPdvStatsToday(token)
      .then((s) => {
        if (!cancelled) {
          setStats(s);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatsErr("Não foi possível carregar as métricas.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, access.pdv]);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Sessão</p>
          <p className="mt-1 truncate text-lg font-semibold text-zinc-100">{user.name}</p>
          <p className="text-sm text-zinc-500">
            {user.login} · <span className="text-zinc-400">{user.role}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.pdv ? (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200/90">
              PDV
            </span>
          ) : (
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-500">PDV</span>
          )}
          {access.erp ? (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200/90">
              ERP
            </span>
          ) : (
            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-500">ERP</span>
          )}
          {access.financeiro ? (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200/90">
              Fin
            </span>
          ) : null}
          {access.manageUsers ? (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200/90">
              Admin
            </span>
          ) : null}
        </div>
      </div>

      {access.pdv ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="overflow-hidden">
            <CardContent className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Vendas encerradas hoje</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
                    {stats ? money.format(stats.closedTodayTotal) : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {stats ? `${stats.closedTodayCount} pedido(s) fechado(s)` : "Carregando…"}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-500/10 p-2.5 ring-1 ring-amber-500/15">
                  <CreditCard className="h-5 w-5 text-amber-300/90" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Comandas abertas</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
                    {stats ? stats.openComandasCount : "—"}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">Em andamento no salão</p>
                </div>
                <div className="rounded-lg bg-emerald-500/10 p-2.5 ring-1 ring-emerald-500/15">
                  <UsersRound className="h-5 w-5 text-emerald-300/90" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardContent className="!p-5">
              <p className="text-xs font-medium text-zinc-500">Atalhos de venda</p>
              {pdvBlocked ? (
                <p className="mt-3 text-[13px] leading-snug text-zinc-500">Abra o caixa para vender.</p>
              ) : null}
              {pdvLoading ? <p className="mt-3 text-[13px] text-zinc-500">Verificando caixa…</p> : null}
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  disabled={!pdvReady}
                  title={pdvBlocked ? "Abra o caixa para usar o PDV" : pdvLoading ? "Verificando caixa…" : "Venda no balcão"}
                  onClick={() => pdvReady && onPdvShortcut("direct")}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    pdvReady
                      ? "border-amber-500/35 bg-amber-500/[0.12] text-amber-100 hover:bg-amber-500/18"
                      : "cursor-not-allowed border-white/[0.06] bg-white/[0.03] text-zinc-600 opacity-60",
                  )}
                >
                  <Store className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  Venda balcão
                </button>
                <button
                  type="button"
                  disabled={!pdvReady}
                  title={pdvBlocked ? "Abra o caixa para usar o PDV" : pdvLoading ? "Verificando caixa…" : "Nova comanda"}
                  onClick={() => pdvReady && onPdvShortcut("comanda")}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    pdvReady
                      ? "border-white/[0.12] bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]"
                      : "cursor-not-allowed border-white/[0.06] bg-white/[0.03] text-zinc-600 opacity-60",
                  )}
                >
                  <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  Venda com comanda
                </button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">Sem acesso ao PDV — métricas indisponíveis.</p>
      )}

      {statsErr ? <p className="text-sm text-red-400/90">{statsErr}</p> : null}

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Ações rápidas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK.map((q) => {
            const ok =
              q.id === "caixa"
                ? access.pdv
                : q.id === "pdv"
                  ? pdvReady
                  : q.id === "erp"
                    ? access.erp
                    : q.id === "financeiro"
                      ? access.financeiro ?? false
                      : q.id === "users"
                      ? access.manageUsers
                      : q.id === "cozinha"
                        ? access.kitchen
                        : q.id === "clientes"
                          ? access.clients
                          : false;
            const Icon = q.icon;
            const blockedPdv = q.id === "pdv" && access.pdv && !pdvReady;
            return (
              <button
                key={q.id}
                type="button"
                disabled={!ok}
                title={
                  blockedPdv
                    ? cashOpen === null
                      ? "Verificando caixa…"
                      : "Abra o caixa para usar o PDV"
                    : undefined
                }
                onClick={() => ok && onNavigate(q.id)}
                className={cn(
                  "group flex flex-col items-start gap-2 rounded-xl border border-white/[0.08] bg-[#1e1e1e]/70 p-4 text-left shadow-md shadow-black/10 backdrop-blur-md transition-all",
                  ok && "hover:border-amber-500/25 hover:bg-[#242424]/90",
                  !ok && "cursor-not-allowed opacity-45",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset",
                    q.accent && ok
                      ? "bg-amber-500/15 text-amber-200 ring-amber-500/20"
                      : "bg-white/[0.06] text-zinc-400 ring-white/[0.06]",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-medium text-zinc-100">{q.label}</p>
                  <p className="text-[13px] text-zinc-500">
                    {q.id === "pdv" && blockedPdv ? "Exige caixa aberto · " : null}
                    {q.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
