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

  const muted = "text-slate-500 dark:text-zinc-500";
  const labelMuted = "text-xs font-medium text-slate-500 dark:text-zinc-400";

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/90 pb-6 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Sessão</p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-zinc-50">{user.name}</p>
          <p className={cn("text-sm", muted)}>
            {user.login} · <span className="text-slate-600 dark:text-zinc-400">{user.role}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {access.pdv ? (
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200">
              PDV
            </span>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-500">
              PDV
            </span>
          )}
          {access.erp ? (
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/50 dark:text-blue-200">
              ERP
            </span>
          ) : (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-500">
              ERP
            </span>
          )}
          {access.financeiro ? (
            <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/45 dark:text-emerald-200">
              Fin
            </span>
          ) : null}
          {access.manageUsers ? (
            <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/45 dark:text-violet-200">
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
                  <p className={labelMuted}>Vendas encerradas hoje</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                    {stats ? money.format(stats.closedTodayTotal) : "—"}
                  </p>
                  <p className={cn("mt-1 text-[11px]", muted)}>
                    {stats ? `${stats.closedTodayCount} pedido(s) fechado(s)` : "Carregando…"}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2.5 ring-1 ring-blue-100 dark:bg-blue-950/50 dark:ring-blue-900/50">
                  <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="!p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={labelMuted}>Comandas abertas</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-zinc-50">
                    {stats ? stats.openComandasCount : "—"}
                  </p>
                  <p className={cn("mt-1 text-[11px]", muted)}>Em andamento no salão</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2.5 ring-1 ring-emerald-100 dark:bg-emerald-950/45 dark:ring-emerald-900/45">
                  <UsersRound className="h-5 w-5 text-emerald-700 dark:text-emerald-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-1">
            <CardContent className="!p-5">
              <p className={labelMuted}>Atalhos de venda</p>
              {pdvBlocked ? (
                <p className={cn("mt-3 text-[13px] leading-snug", muted)}>Abra o caixa para vender.</p>
              ) : null}
              {pdvLoading ? <p className={cn("mt-3 text-[13px]", muted)}>Verificando caixa…</p> : null}
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  disabled={!pdvReady}
                  title={pdvBlocked ? "Abra o caixa para usar o PDV" : pdvLoading ? "Verificando caixa…" : "Venda no balcão"}
                  onClick={() => pdvReady && onPdvShortcut("direct")}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    pdvReady
                      ? "border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100/90 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100 dark:hover:bg-blue-950/70"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-70 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-600",
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
                      ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-70 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-600",
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
        <p className={cn("text-sm", muted)}>Sem acesso ao PDV — métricas indisponíveis.</p>
      )}

      {statsErr ? <p className="text-sm text-red-600 dark:text-red-400/90">{statsErr}</p> : null}

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Ações rápidas</h2>
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
                  "group flex flex-col items-start gap-2 rounded-xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-all dark:border-zinc-700 dark:bg-zinc-900",
                  ok && "hover:border-blue-300 hover:shadow-md dark:hover:border-blue-700/80 dark:hover:bg-zinc-800/95",
                  !ok && "cursor-not-allowed opacity-45",
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset",
                    q.accent && ok
                      ? "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900/50"
                      : "bg-slate-50 text-slate-500 ring-slate-100 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="font-medium text-slate-900 dark:text-zinc-100">{q.label}</p>
                  <p className={cn("text-[13px]", muted)}>
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
