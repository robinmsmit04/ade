// Lightweight disposable integration stack for constrained Docker VFS hosts.
// Not production infrastructure. Uses random local credentials, never external keys.
import { execFileSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
const dir = new URL("../.local-stack/", import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL("credentials.json", dir);
const creds = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : {
      password: randomBytes(24).toString("hex"),
      jwt: randomBytes(32).toString("hex"),
      secret: randomBytes(48).toString("hex"),
    };
writeFileSync(file, JSON.stringify(creds), { mode: 0o600 });
function jwt(role) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b({ alg: "HS256", typ: "JWT" })}.${b({ role, iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 30 * 86400 })}`;
  return `${body}.${createHmac("sha256", creds.jwt).update(body).digest("base64url")}`;
}
const anon = jwt("anon"),
  service = jwt("service_role");
function docker(args, input) {
  try {
    return execFileSync("docker", args, {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    console.error("Docker operation failed:", args[0], args[1] || "");
    if (e.stderr)
      console.error(
        String(e.stderr)
          .replaceAll(creds.password, "[local-password]")
          .replaceAll(creds.jwt, "[local-jwt]"),
      );
    process.exit(1);
  }
}
const network = "crew-control-local";
if (
  !docker(["network", "ls", "--format", "{{.Name}}"])
    .split("\n")
    .includes(network)
)
  docker(["network", "create", network]);
async function start(name, image, env, port, args = []) {
  if (
    docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n").includes(name)
  ) {
    docker(["start", name]);
    return;
  }
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--network",
    network,
    ...(port ? ["-p", `127.0.0.1:${port}`] : []),
    ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    image,
    ...args,
  ]);
}
await start(
  "crew-db",
  "postgres:17-alpine",
  { POSTGRES_PASSWORD: creds.password },
  "54322:5432",
  [
    "postgres",
    "-c",
    "wal_level=logical",
    "-c",
    "max_replication_slots=10",
    "-c",
    "max_wal_senders=10",
  ],
);
for (let n = 0; n < 30; n++) {
  try {
    execFileSync(
      "docker",
      ["exec", "crew-db", "pg_isready", "-U", "postgres"],
      { stdio: "ignore" },
    );
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const bootstrap = `
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$begin
if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create role authenticator login password '${creds.password}' noinherit; create role supabase_auth_admin login password '${creds.password}' noinherit createrole; create role supabase_storage_admin login password '${creds.password}' noinherit createrole; create role supabase_admin login superuser password '${creds.password}';end if;
end$$;
grant anon,authenticated,service_role to authenticator,supabase_storage_admin;
alter role supabase_auth_admin set search_path=auth,public,extensions;
alter role supabase_storage_admin set search_path=storage,public,extensions;
grant all on database postgres to supabase_auth_admin,supabase_storage_admin;
create schema if not exists auth authorization supabase_auth_admin;
create schema if not exists storage authorization supabase_storage_admin;
create schema if not exists _realtime authorization supabase_admin;
create schema if not exists realtime authorization supabase_admin;
grant usage on schema public,auth,extensions to anon,authenticated,service_role;
grant all on schema public,extensions to supabase_storage_admin;
create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')) $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
do $$begin if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime;end if;end$$;
`;
docker(
  ["exec", "-i", "crew-db", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
  bootstrap,
);
await start(
  "crew-auth",
  "supabase/gotrue:v2.186.0",
  {
    GOTRUE_API_HOST: "0.0.0.0",
    GOTRUE_API_PORT: "9999",
    API_EXTERNAL_URL: "http://127.0.0.1:54321",
    GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${creds.password}@crew-db:5432/postgres`,
    GOTRUE_SITE_URL: "http://localhost:3000",
    GOTRUE_URI_ALLOW_LIST: "http://localhost:3000/**,http://127.0.0.1:3000/**",
    GOTRUE_JWT_SECRET: creds.jwt,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
    GOTRUE_RATE_LIMIT_SIGN_UPS: "1000",
    GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: "10",
  },
  "54325:9999",
);
await start(
  "crew-rest",
  "postgrest/postgrest:v14.3",
  {
    PGRST_DB_URI: `postgres://authenticator:${creds.password}@crew-db:5432/postgres`,
    PGRST_DB_SCHEMAS: "public,storage",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: creds.jwt,
    PGRST_DB_USE_LEGACY_GUCS: "false",
  },
  "54326:3000",
);
await start(
  "crew-storage",
  "supabase/storage-api:v1.35.3",
  {
    ANON_KEY: anon,
    SERVICE_KEY: service,
    POSTGREST_URL: "http://crew-rest:3000",
    AUTH_JWT_SECRET: creds.jwt,
    DATABASE_URL: `postgres://supabase_storage_admin:${creds.password}@crew-db:5432/postgres`,
    FILE_SIZE_LIMIT: "26214400",
    STORAGE_BACKEND: "file",
    FILE_STORAGE_BACKEND_PATH: "/var/lib/storage",
    TENANT_ID: "stub",
    REGION: "local",
    GLOBAL_S3_BUCKET: "stub",
    ENABLE_IMAGE_TRANSFORMATION: "false",
  },
  "54327:5000",
);
await start(
  "crew-realtime",
  "supabase/realtime:v2.73.2",
  {
    PORT: "4000",
    DB_HOST: "crew-db",
    DB_PORT: "5432",
    DB_USER: "supabase_admin",
    DB_PASSWORD: creds.password,
    DB_NAME: "postgres",
    DB_AFTER_CONNECT_QUERY: "SET search_path TO _realtime",
    DB_ENC_KEY: "supabaserealtime",
    API_JWT_SECRET: creds.jwt,
    SECRET_KEY_BASE: creds.secret,
    ERL_AFLAGS: "-proto_dist inet_tcp",
    DNS_NODES: "''",
    RLIMIT_NOFILE: "10000",
    APP_NAME: "realtime",
    SEED_SELF_HOST: "true",
    RUN_JANITOR: "true",
  },
  "54328:4000",
);
for (const [port, path] of [
  [54325, "/health"],
  [54327, "/status"],
  [54326, "/"],
]) {
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}${path}`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw new Error(`Local service ${port} not ready; inspect docker logs.`);
}
// Standard CLI images already include this plugin. The small fallback builds the same upstream plugin.
try {
  execFileSync(
    "docker",
    ["exec", "crew-db", "test", "-r", "/usr/local/lib/postgresql/wal2json.so"],
    { stdio: "ignore" },
  );
} catch {
  execFileSync("bash", ["scripts/local-wal2json.sh"], { stdio: "inherit" });
}
for (let i = 0; i < 60; i++) {
  try {
    await fetch("http://127.0.0.1:54328/");
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
docker([
  "exec",
  "crew-realtime",
  "/app/bin/realtime",
  "rpc",
  'case Realtime.Api.get_tenant_by_external_id("realtime-dev") |> Realtime.Tenants.Migrations.run_migrations() do result when result in [:ok, :noop] -> IO.puts("Realtime migrations ready"); _ -> raise "Realtime tenant migrations failed" end',
]);
// Restore modern JSON-claim helpers after first-run Auth migrations.
docker(
  ["exec", "-i", "crew-db", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
  bootstrap,
);
docker([
  "exec",
  "crew-db",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "grant usage on schema storage to anon,authenticated,service_role; grant all on all tables in schema storage to anon,authenticated,service_role; grant usage,select on all sequences in schema storage to anon,authenticated,service_role;",
]);
// Track migrations in the database so a fresh container cannot inherit a stale disk marker.
docker([
  "exec",
  "crew-db",
  "psql",
  "-U",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "create schema if not exists crew_dev; create table if not exists crew_dev.migrations(name text primary key);",
]);
const { readdirSync } = await import("node:fs");
for (const name of readdirSync(
  new URL("../supabase/migrations/", import.meta.url),
).sort()) {
  const applied = docker([
    "exec",
    "crew-db",
    "psql",
    "-U",
    "postgres",
    "-At",
    "-c",
    `select count(*) from crew_dev.migrations where name='${name}'`,
  ]);
  if (applied === "0")
    docker(
      [
        "exec",
        "-i",
        "crew-db",
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      `begin;\n${readFileSync(new URL("../supabase/migrations/" + name, import.meta.url), "utf8")}\ninsert into crew_dev.migrations values('${name}');commit;`,
    );
}
docker([
  "exec",
  "crew-db",
  "psql",
  "-U",
  "postgres",
  "-c",
  "NOTIFY pgrst, 'reload schema'",
]);
const settings = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anon,
  TEST_SUPABASE_URL: "http://127.0.0.1:54321",
  TEST_SUPABASE_ANON_KEY: anon,
};
writeFileSync(new URL("client-env.json", dir), JSON.stringify(settings), {
  mode: 0o600,
});
console.log(
  "Local database, Auth, REST, Storage and Realtime started. Run node scripts/local-proxy.mjs, then node scripts/with-local-env.mjs <command> [args].",
);
