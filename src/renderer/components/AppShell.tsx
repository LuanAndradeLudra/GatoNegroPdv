import {
  AlertTriangle,
  Building2,
  ChefHat,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
  ShoppingCart,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../lib/cn";
import type { UserAccess } from "../api";

export type ShellView =
  | "home"
  | "caixa"
  | "pdv"
  | "erp"
  | "financeiro"
  | "users"
  | "cozinha"
  | "clientes"
  | "settings";

type NavDef = {
  id: ShellView;
  label: string;
  icon: typeof LayoutDashboard;
  enabled: (a: UserAccess) => boolean;
};

/** PDV e Cozinha exigem caixa aberto; `null` = carregando (bloqueia até saber). */
function navBlockedByCash(itemId: ShellView, access: UserAccess, cashOpen: boolean | null): boolean {
  if (itemId === "pdv" && access.pdv) {
    return cashOpen === false || cashOpen === null;
  }
  if (itemId === "cozinha" && access.kitchen) {
    return cashOpen === false || cashOpen === null;
  }
  return false;
}

const NAV: NavDef[] = [
  { id: "home", label: "Início", icon: LayoutDashboard, enabled: () => true },
  { id: "caixa", label: "Caixa", icon: Wallet, enabled: (a) => a.pdv },
  { id: "pdv", label: "PDV", icon: ShoppingCart, enabled: (a) => a.pdv },
  { id: "erp", label: "ERP", icon: Building2, enabled: (a) => a.erp },
  { id: "financeiro", label: "Financeiro", icon: LineChart, enabled: (a) => a.financeiro ?? false },
  { id: "users", label: "Usuários", icon: Users, enabled: (a) => a.manageUsers },
  { id: "cozinha", label: "Cozinha", icon: ChefHat, enabled: (a) => a.kitchen },
  { id: "clientes", label: "Clientes", icon: UsersRound, enabled: (a) => a.clients },
  { id: "settings", label: "Configurações", icon: Settings, enabled: () => true },
];

const TITLES: Record<ShellView, string> = {
  home: "Início",
  caixa: "Caixa",
  pdv: "PDV — Nova venda",
  erp: "ERP",
  financeiro: "Financeiro",
  users: "Gestão de usuários",
  cozinha: "Cozinha",
  clientes: "Clientes",
  settings: "Configurações",
};

export function AppShell({
  view,
  onNavigate,
  access,
  cashOpen,
  cashClosedBanner,
  children,
  title,
  headerRight,
  onLogout,
  brandSubtitle = "PDV",
}: {
  view: ShellView;
  onNavigate: (v: ShellView) => void;
  access: UserAccess;
  /** `true` = caixa aberto, `false` = fechado, `null` = carregando (PDV/cozinha). */
  cashOpen: boolean | null;
  cashClosedBanner?: { onOpenCash: () => void };
  children: ReactNode;
  title?: string;
  headerRight?: ReactNode;
  onLogout: () => void;
  brandSubtitle?: string;
}) {
  const pageTitle = title ?? TITLES[view];

  return (
    <div className="flex h-screen min-h-0 w-full bg-[#121212] text-zinc-100">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/[0.08] bg-[#141414]/95 backdrop-blur-xl">
        <div className="border-b border-white/[0.06] px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400/25 to-amber-700/20 ring-1 ring-amber-500/20">
              <span className="text-lg font-bold text-amber-200">GN</span>
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate font-semibold tracking-tight text-zinc-100">Gato Negro</p>
              <p className="text-[11px] text-zinc-500">{brandSubtitle}</p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const ok = item.enabled(access);
            const cashLocked = navBlockedByCash(item.id, access, cashOpen);
            const Icon = item.icon;
            const active = view === item.id;
            const disabled = !ok || cashLocked;
            const titleNav =
              !ok
                ? "Sem permissão para este módulo"
                : cashLocked
                  ? cashOpen === null
                    ? "Verificando caixa…"
                    : "Abra o caixa para usar este módulo"
                  : undefined;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                title={titleNav}
                onClick={() => !disabled && onNavigate(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  active && !disabled && "bg-white/[0.08] text-zinc-50 shadow-sm shadow-black/20",
                  !active && !disabled && "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
                  disabled && "cursor-not-allowed text-zinc-600 opacity-50",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0 opacity-90" strokeWidth={1.75} />
                <span className="truncate font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/[0.06] p-2">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#121212]/80 px-6 backdrop-blur-md">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-200">{pageTitle}</h1>
          <div className="flex items-center gap-3">{headerRight}</div>
        </header>
        {cashClosedBanner ? (
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/25 bg-amber-950/40 px-4 py-2.5 text-center text-[13px] text-amber-100/95">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={2} aria-hidden />
            <span>
              Operação bloqueada: o caixa está fechado.{" "}
              <button
                type="button"
                className="font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
                onClick={cashClosedBanner.onOpenCash}
              >
                Clique aqui para abrir
              </button>
            </span>
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

export { NAV, TITLES };
