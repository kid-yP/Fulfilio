import { InputHTMLAttributes, forwardRef } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className = "", id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-widest2 text-graphite-400">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`rounded-md border bg-graphite-800 px-3 py-2 text-sm text-graphite-50 placeholder:text-graphite-500
          focus:border-amber-500
          ${error ? "border-signal-red" : "border-graphite-600"} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-signal-red">{error}</p>}
    </div>
  ),
);
Input.displayName = "Input";
