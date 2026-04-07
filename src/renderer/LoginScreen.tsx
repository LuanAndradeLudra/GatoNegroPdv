import { FormEvent, useState } from "react";
import { apiLogin } from "./api";
import { useAuth } from "./AuthContext";
import { ThemeToggle } from "./components/ThemeToggle";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

export function LoginScreen() {
  const { login } = useAuth();
  const [userLogin, setUserLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token } = await apiLogin(userLogin.trim(), password);
      await login(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f4f6f9] p-6 font-sans antialiased dark:bg-[#0c0c0f]">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[400px] rounded-2xl border border-slate-200 bg-white p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_8px_30px_rgb(0,0,0,0.35)]">
        
        <div className="mb-10 text-center">
          {/* Ícone ou Logo sutil */}
          <div className="mx-auto mb-4 flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl bg-slate-900 shadow-lg ring-1 ring-slate-900/10 dark:bg-zinc-950 dark:ring-zinc-700">
            <img src="https://scontent.fsdu11-1.fna.fbcdn.net/v/t39.30808-6/326474914_507312491547613_2067051569897241797_n.jpg?_nc_cat=106&ccb=1-7&_nc_sid=1d70fc&_nc_ohc=u6Udw5VlPSwQ7kNvwFmCWfb&_nc_oc=AdrAmGot1PMOX1dXZoVE5w93s5-mlDj1rhiow5FVSNpknssYuTqhCgGjCSpmVvBQpTM&_nc_zt=23&_nc_ht=scontent.fsdu11-1.fna&_nc_gid=rPBB7uuokUmVGvjNqnmlEQ&_nc_ss=7a3a8&oh=00_Af0PnYdzW-biyTu59q6LlAyJmITMarlST1g4DrGQDyd4UA&oe=69DB2B53" alt="Logo" width={82} height={82} className="h-full w-full object-cover" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-zinc-50">Bem-vindo de volta</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-zinc-400">
            Acesse o painel do Gato Negro
          </p>
        </div>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="space-y-1">
            <Input
              label="Usuário"
              placeholder="Digite seu login"
              type="text"
              name="login"
              className="h-11 border-slate-200 bg-slate-50/50 text-black transition-all focus:bg-white"
              autoComplete="username"
              value={userLogin}
              onChange={(e) => setUserLogin(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
               <label className="text-sm font-medium text-slate-700 dark:text-zinc-300">Senha</label>
            </div>
            <Input
              placeholder="••••••••"
              type="password"
              name="password"
              className="h-11 border-slate-200 bg-slate-50/50 transition-all focus:bg-white"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-center dark:bg-red-950/40">
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <Button 
            type="submit" 
            className="h-11 w-full bg-slate-900 font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.98]" 
            disabled={submitting}
          >
            {submitting ? "Autenticando..." : "Entrar no Sistema"}
          </Button>
        </form>

        <footer className="mt-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-zinc-500">
            v1.0 — Enterprise Edition
          </p>
        </footer>
      </div>
    </div>
  );
}