import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const env = JSON.parse(
  readFileSync(
    new URL("../.local-stack/client-env.json", import.meta.url),
    "utf8",
  ),
);
const [command, ...args] = process.argv.slice(2);
if (!command)
  throw new Error("Supply a command, e.g. npm run test:integration");
const child = spawn(command, args, {
  stdio: "inherit",
  env: { ...process.env, ...env },
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
