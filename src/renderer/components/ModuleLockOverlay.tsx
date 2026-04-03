import { Lock } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "../ui/Button";

export function ModuleLockOverlay({
  active,
  onGoToCash,
  children,
}: {
  active: boolean;
  onGoToCash: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-full">
      <div
        className={
          active
            ? "pointer-events-none min-h-full select-none opacity-[0.42] blur-[0.5px] transition-opacity"
            : "min-h-full"
        }
      >
        {children}
      </div>
      {active ? (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[#0a0a0a]/72 px-6 backdrop-blur-md">
          <div className="rounded-full border border-amber-500/30 bg-amber-500/10 p-5 ring-2 ring-amber-500/20">
            <Lock className="h-10 w-10 text-amber-200/95" strokeWidth={1.5} />
          </div>
          <div className="max-w-sm text-center">
            <p className="text-base font-semibold text-zinc-100">Módulo bloqueado</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Abra o caixa para liberar vendas e a cozinha. Operações financeiras exigem um turno de caixa ativo.
            </p>
          </div>
          <Button type="button" onClick={onGoToCash}>
            Ir para abertura de caixa
          </Button>
        </div>
      ) : null}
    </div>
  );
}
