import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { apiCashOpenStatus } from "./api";
import { CashRegisterScreen } from "./CashRegisterScreen";
import { CustomersScreen } from "./CustomersScreen";
import { DashboardHome } from "./DashboardHome";
import { KitchenScreen } from "./KitchenScreen";
import { useAuth } from "./AuthContext";
import { ModuleLockOverlay } from "./components/ModuleLockOverlay";
import { PdvScreen, type PdvBootPayload } from "./PdvScreen";
import { PaymentMethodsScreen } from "./PaymentMethodsScreen";
import { ErpStockScreen } from "./ErpStockScreen";
import { FinanceScreen } from "./FinanceScreen";
import { UsersScreen } from "./UsersScreen";
import { AppShell, type ShellView } from "./components/AppShell";

export function HubScreen() {
  const { state, logout } = useAuth();
  const [view, setView] = useState<ShellView>("home");
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [pdvBoot, setPdvBoot] = useState<PdvBootPayload | null>(null);
  /** Incrementado ao escolher PDV no menu — remonta o PDV e volta ao menu inicial (ex.: sair de uma comanda aberta). */
  const [pdvShellKey, setPdvShellKey] = useState(0);

  const user = state.status === "authenticated" ? state.user : null;
  const token = state.status === "authenticated" ? state.token : null;
  const access = user?.access;

  const refreshCash = useCallback(async () => {
    if (!token || (!access?.pdv && !access?.kitchen)) {
      setCashOpen(null);
      return;
    }
    try {
      const open = await apiCashOpenStatus(token);
      setCashOpen(open);
    } catch {
      setCashOpen(false);
    }
  }, [token, access?.pdv, access?.kitchen]);

  useEffect(() => {
    void refreshCash();
  }, [refreshCash]);

  const clearPdvBoot = useCallback(() => setPdvBoot(null), []);

  function handleNavigate(v: ShellView) {
    if (v === "pdv") {
      setPdvBoot(null);
      setPdvShellKey((k) => k + 1);
    }
    setView(v);
  }

  useEffect(() => {
    if (!user || !access) {
      return;
    }
    const allowed = (v: ShellView): boolean => {
      switch (v) {
        case "home":
        case "settings":
          return true;
        case "caixa":
        case "pdv":
          return access.pdv;
        case "erp":
          return access.erp;
        case "users":
          return access.manageUsers;
        case "cozinha":
          return access.kitchen;
        case "clientes":
          return access.clients;
        case "financeiro":
          return access.financeiro ?? false;
        default:
          return false;
      }
    };
    if (!allowed(view)) {
      setView("home");
    }
  }, [user, access, view]);

  if (state.status !== "authenticated" || !user || !token || !access) {
    return null;
  }

  const needsCashGate = access.pdv || access.kitchen;
  const cashGateOpen = needsCashGate ? cashOpen : null;

  return (
    <AppShell
      view={view}
      onNavigate={handleNavigate}
      access={access}
      cashOpen={cashGateOpen}
      cashClosedBanner={
        needsCashGate && cashOpen === false
          ? { onOpenCash: () => setView("caixa") }
          : undefined
      }
      onLogout={logout}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="min-h-full"
        >
          {view === "home" ? (
            <DashboardHome
              user={user}
              token={token}
              access={access}
              cashOpen={cashGateOpen}
              onNavigate={handleNavigate}
              onPdvShortcut={(mode) => {
                setPdvBoot({ mode, id: Date.now() });
                setView("pdv");
              }}
            />
          ) : null}
          {view === "caixa" ? <CashRegisterScreen onSessionChange={() => void refreshCash()} /> : null}
          {view === "pdv" ? (
            <ModuleLockOverlay active={cashOpen === false && !!access.pdv} onGoToCash={() => setView("caixa")}>
              <PdvScreen key={pdvShellKey} boot={pdvBoot} onBootConsumed={clearPdvBoot} />
            </ModuleLockOverlay>
          ) : null}
          {view === "erp" ? <ErpStockScreen /> : null}
          {view === "financeiro" ? <FinanceScreen /> : null}
          {view === "users" ? <UsersScreen /> : null}
          {view === "cozinha" ? (
            <ModuleLockOverlay active={cashOpen === false && !!access.kitchen} onGoToCash={() => setView("caixa")}>
              <KitchenScreen />
            </ModuleLockOverlay>
          ) : null}
          {view === "clientes" ? <CustomersScreen /> : null}
          {view === "settings" ? <PaymentMethodsScreen /> : null}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
