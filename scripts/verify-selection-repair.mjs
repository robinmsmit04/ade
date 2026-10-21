// Run the dashboard repair against a disposable COPY of the local database only.
// Never accepts a remote URL and never prints database dumps or credentials.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const database = `selection_repair_verification_${Date.now()}`;
const ids = Array.from({ length: 3 }, () => randomUUID());
const placeholder = "00000000-0000-0000-0000-000000000000";
const repair = readFileSync(
  new URL("../docs/herstel-opstellingsbeheer.sql", import.meta.url),
  "utf8",
);
const docker = (args, input) =>
  execFileSync(
    "docker",
    ["exec", ...(input === undefined ? [] : ["-i"]), "crew-db", ...args],
    {
      input,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
const sql = (statement) =>
  docker(
    [
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
    ],
    statement,
  );
const forUser = (id) =>
  repair.replace(
    `mijn_account uuid := '${placeholder}'`,
    `mijn_account uuid := '${id}'`,
  );
let created = false;
try {
  docker(["createdb", "-U", "postgres", "-T", "template0", database]);
  created = true;
  sql(
    docker([
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--clean",
      "--if-exists",
      "--no-owner",
    ]),
  );
  sql(`
    insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at)
    values ('${ids[0]}','selection-repair-owner@example.invalid','{}','{}',now()),
    ('${ids[1]}','selection-repair-member@example.invalid','{}','{}',now()),
    ('${ids[2]}','selection-repair-unconfirmed@example.invalid','{}','{}',null);
    delete from public.members where user_id='${ids[1]}' and crew_id=(select crew_id from public.community_settings);
    update public.consents set sharing=true where user_id='${ids[0]}';
    update public.team_settings set manager_id='${ids[1]}' where crew_id=(select crew_id from public.community_settings);
  `);
  const fingerprint = (tables) =>
    sql(
      tables
        .map(
          (t) =>
            `select '${t}',md5(coalesce(string_agg(row_to_json(x)::text,',' order by row_to_json(x)::text),'')) from ${t} x;`,
        )
        .join("\n"),
    );
  const retained = [
    "auth.users",
    "public.profiles",
    "public.records",
    "public.checkins",
    "public.submissions",
    "public.reviews",
    "public.awards",
    "public.team_lineup",
    "public.match_reports",
  ];
  const before = fingerprint(retained);
  for (const statement of [repair, forUser(randomUUID()), forUser(ids[2])]) {
    let rejected = false;
    try {
      sql(statement);
    } catch {
      rejected = true;
    }
    if (!rejected)
      throw new Error(
        "Repair accepted a placeholder, unknown or unconfirmed owner",
      );
    if (fingerprint(retained) !== before)
      throw new Error("Rejected repair changed retained data");
  }
  sql(forUser(ids[0]));
  if (fingerprint(retained) !== before)
    throw new Error(
      "Repair changed accounts, profiles, photos, records or lineup",
    );
  const result = sql(`
    select manager_id='${ids[0]}' from public.team_settings where crew_id=(select crew_id from public.community_settings);
    select count(*) from public.members where user_id='${ids[0]}' and role='member';
    select count(*) from public.members where user_id='${ids[1]}' and crew_id=(select crew_id from public.community_settings);
    select count(*) from public.members where user_id='${ids[2]}';
    select sharing from public.consents where user_id='${ids[0]}';
    select sharing from public.consents where user_id='${ids[1]}';
    select count(*) from public.profiles where id in('${ids[0]}','${ids[1]}','${ids[2]}') and profile_completed_at is null and onboarding_completed_at is null;
  `)
    .trim()
    .split("\n");
  if (
    JSON.stringify(result) !==
    JSON.stringify(["t", "1", "1", "0", "t", "f", "3"])
  )
    throw new Error(
      "Repair violated manager, membership, confirmation or consent invariants",
    );
  sql(forUser(ids[0]));
  if (fingerprint(retained) !== before)
    throw new Error("Repeated repair changed retained data");
  console.log(
    "Selection repair verified: explicit owner only, confirmed incomplete profiles enrolled, unconfirmed excluded, consent and existing data retained, no admin promotion, repeat-safe.",
  );
} finally {
  if (created) docker(["dropdb", "-U", "postgres", "--force", database]);
}
