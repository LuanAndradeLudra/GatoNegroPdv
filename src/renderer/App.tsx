import { AuthProvider, useAuth } from "./AuthContext";
import { HubScreen } from "./HubScreen";
import { LoginScreen } from "./LoginScreen";

function AppRoutes() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="app-loading">
        <p>Carregando…</p>
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
