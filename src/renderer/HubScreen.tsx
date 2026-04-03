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
import { UsersScreen } from "./UsersScreen";
import { AppShell, type ShellView } from "./components/AppShell";
import { Card, CardContent } from "./ui/Card";

function ErpPlaceholder() {
  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Card>
        <CardContent className="!py-10 text-center">
          <p className="text-lg font-medium text-zinc-200">Módulo ERP</p>
          <p className="mt-2 text-sm text-zinc-500">Integração de estoque e cadastros em desenvolvimento.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function HubScreen() {
  const { state, logout } = useAuth();
  const [view, setView] = useState<ShellView>("home");
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [pdvBoot, setPdvBoot] = useState<PdvBootPayload | null>(null);

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
              <PdvScreen boot={pdvBoot} onBootConsumed={clearPdvBoot} />
            </ModuleLockOverlay>
          ) : null}
          {view === "erp" ? <ErpPlaceholder /> : null}
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
