import "dotenv/config";
import { execSync } from "child_process";

// DATABASE_URL must already point at a dedicated test database when this runs
// (set it in the shell/CI env before `npm test` — see README). Tests truncate
// tables between cases, so never point this at a database with real data.
export default async function globalSetup() {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
}
