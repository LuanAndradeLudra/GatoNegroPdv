import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; id?: string }
>(function Input(
  { className, label, hint, id, ...props },
  ref,
) {
  const inputId = id ?? (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-700 dark:text-zinc-300 ml-0.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "h-11 rounded-xl border border-slate-200 bg-slate-50/50 px-4 text-sm text-slate-900",
          "placeholder:text-slate-400 outline-none transition-all duration-200",
          "focus:border-slate-900 focus:bg-white focus:ring-[3px] focus:ring-slate-950/5",
          "dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-100 dark:placeholder:text-zinc-500",
          "dark:focus:border-blue-500 dark:focus:bg-zinc-900 dark:focus:ring-blue-500/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {hint && (
        <span className="text-[12px] font-medium text-slate-400 dark:text-zinc-500 ml-0.5">{hint}</span>
      )}
    </div>
  );
});