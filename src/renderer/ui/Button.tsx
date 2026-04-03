import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-amber-300 to-amber-600 text-zinc-950 font-semibold shadow-md shadow-amber-950/30 hover:brightness-105 border border-amber-400/30",
  outline:
    "border border-white/[0.12] bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] backdrop-blur-sm",
  ghost: "border border-transparent text-zinc-300 hover:bg-white/[0.06]",
  danger: "border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/15",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors disabled:pointer-events-none disabled:opacity-45",
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
});
