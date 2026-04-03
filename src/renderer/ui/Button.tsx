import { cn } from "../lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:scale-[0.98] border border-transparent dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
  outline:
    "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm active:scale-[0.98] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:border-zinc-500",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
  danger:
    "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 active:scale-[0.98] dark:bg-red-950/50 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/80",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>(function Button(
  { className, variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
});