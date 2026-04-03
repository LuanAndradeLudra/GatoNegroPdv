import {
  AlertTriangle,
  Building2,
  ChefHat,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Settings,
  ShoppingCart,
  Users,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "../lib/cn";
import type { UserAccess } from "../api";
import { ThemeToggle } from "./ThemeToggle";

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const close = () => setMobileNavOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  function navigateAndCloseMobile(v: ShellView) {
    onNavigate(v);
    setMobileNavOpen(false);
  }

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-[#f4f6f9] text-slate-800 dark:bg-[#0c0c0f] dark:text-zinc-100">
      {/* Overlay mobile: fecha ao tocar fora */}
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      {/* Sidebar — drawer no mobile, coluna fixa no lg+ */}
      <aside
        className={cn(
          "flex min-h-0 w-0 max-w-[320px] shrink-0 flex-col overflow-visible border-r border-slate-200/90 bg-white shadow-[2px_0_16px_rgba(15,23,42,0.06)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none",
          "fixed inset-y-0 left-0 z-50 w-[min(280px,88vw)] transform transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-[260px] lg:max-w-none lg:translate-x-0",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex h-[57px] shrink-0 items-center gap-3 border-b border-slate-200/80 px-4 dark:border-zinc-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 ring-1 ring-slate-900/10 dark:bg-zinc-950 dark:ring-zinc-700">
            <img src="/logo.jpg" alt="" className="h-full w-full object-cover" width={40} height={40} />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold tracking-tight text-slate-900 dark:text-zinc-50">Gato Negro</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-500">{brandSubtitle}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Fechar menu"
            onClick={() => setMobileNavOpen(false)}
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3 pt-4" aria-label="Módulos">
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
                onClick={() => !disabled && navigateAndCloseMobile(item.id)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md border-l-[3px] py-2.5 pl-3 pr-2 text-left text-[13px] font-medium transition-colors",
                  active && !disabled
                    ? "border-l-blue-600 bg-blue-50/95 text-blue-900 shadow-sm dark:border-l-blue-500 dark:bg-blue-950/45 dark:text-blue-100"
                    : "border-l-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800/90 dark:hover:text-zinc-100",
                  disabled && "cursor-not-allowed text-slate-400 opacity-50 dark:text-zinc-600",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    active && !disabled ? "text-blue-600 dark:text-blue-400" : "text-slate-500 group-hover:text-slate-700 dark:text-zinc-500 dark:group-hover:text-zinc-300",
                  )}
                  strokeWidth={1.85}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200/80 p-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.85} />
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200/90 bg-white px-4 shadow-sm sm:px-5 dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-none">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm transition-colors hover:bg-slate-50 lg:hidden dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              aria-label="Abrir menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Painel</p>
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-100">{pageTitle}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            <ThemeToggle />
          </div>
        </header>

        {cashClosedBanner ? (
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-200/80 bg-amber-50 px-4 py-2.5 text-center text-[13px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100/95">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={2} aria-hidden />
            <span>
              Operação bloqueada: o caixa está fechado.{" "}
              <button
                type="button"
                className="font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
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
