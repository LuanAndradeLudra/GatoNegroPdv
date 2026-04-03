import { AuthProvider, useAuth } from "./AuthContext";
import { HubScreen } from "./HubScreen";
import { LoginScreen } from "./LoginScreen";

function AppRoutes() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9] font-sans text-sm text-slate-500 dark:bg-[#0c0c0f] dark:text-zinc-500">
        Carregando…
      </div>
    );
  }

  if (state.status === "anonymous") {
    return <LoginScreen />;
  }

  return <HubScreen />;
}

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
