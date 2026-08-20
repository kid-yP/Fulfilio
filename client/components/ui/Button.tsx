import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-amber-500 text-graphite-950 hover:bg-amber-400 disabled:bg-graphite-600",
  secondary:
    "bg-transparent text-graphite-100 border border-graphite-600 hover:border-graphite-400 disabled:opacity-40",
  danger: "bg-signal-red text-graphite-50 hover:brightness-110 disabled:bg-graphite-600",
  ghost: "bg-transparent text-graphite-300 hover:text-graphite-50 disabled:opacity-40",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium
        transition-colors duration-150 motion-reduce:transition-none disabled:cursor-not-allowed
        ${variants[variant]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";
