import { SelectHTMLAttributes, forwardRef } from "react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(
  ({ label, className = "", id, children, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-widest2 text-graphite-400">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`rounded-md border border-graphite-600 bg-graphite-800 px-3 py-2 text-sm text-graphite-50
          focus:border-amber-500 ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  ),
);
Select.displayName = "Select";
