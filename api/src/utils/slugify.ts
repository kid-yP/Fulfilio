import crypto from "crypto";

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Append a short random suffix so two workspaces named "Acme" don't collide.
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}
