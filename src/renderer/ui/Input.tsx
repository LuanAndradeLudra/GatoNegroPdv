import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, id, ...props },
  ref,
) {
  const inputId = id ?? (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-500">
      {label ? <span className="text-zinc-400">{label}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "rounded-lg border border-white/[0.1] bg-[#141414] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors",
          "focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/30",
          className,
        )}
        {...props}
      />
      {hint ? <span className="text-[11px] font-normal text-zinc-600">{hint}</span> : null}
    </label>
  );
});
