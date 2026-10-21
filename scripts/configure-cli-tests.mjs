// Read local CLI status in memory; persist only the public client/test bindings.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const raw = execFileSync(
  process.argv[2] || "supabase",
  ["status", "--output", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
);
const { API_URL, ANON_KEY } = JSON.parse(raw);
if (!API_URL || !ANON_KEY)
  throw new Error("Local CLI API_URL/ANON_KEY unavailable.");
mkdirSync(".local-stack", { recursive: true });
writeFileSync(
  ".local-stack/client-env.json",
  JSON.stringify({
    NEXT_PUBLIC_SUPABASE_URL: API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
    TEST_SUPABASE_URL: API_URL,
    TEST_SUPABASE_ANON_KEY: ANON_KEY,
  }),
  { mode: 0o600 },
);
console.log("Public local test bindings written to ignored configuration.");
