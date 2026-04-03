import { AuthProvider, useAuth } from "./AuthContext";
import { HubScreen } from "./HubScreen";
import { LoginScreen } from "./LoginScreen";

function AppRoutes() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] font-sans text-sm text-zinc-500">
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
