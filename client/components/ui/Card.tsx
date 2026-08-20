import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-graphite-700 bg-graphite-800/60 p-5 ${className}`}
      {...props}
    />
  );
}

export function CardHeading({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`mb-4 text-xs font-semibold uppercase tracking-widest2 text-graphite-400 ${className}`}
      {...props}
    />
  );
}
