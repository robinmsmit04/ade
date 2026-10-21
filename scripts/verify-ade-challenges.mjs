// Exercise the entire catalog upgrade in a disposable local database copy, never production.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const database = `ade_catalog_verification_${Date.now()}`;
const users = Array.from({ length: 3 }, () => randomUUID());
const legacy = randomUUID(),
  submission = randomUUID();
const upgrade = readFileSync(
  new URL("../docs/enable-ade-challenges.sql", import.meta.url),
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
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at) values ${users.map((id) => `('${id}','catalog-${id}@example.invalid','{}','{}',now())`).join(",")};
 select set_config('request.jwt.claim.sub','${users[0]}',false);
 select public.create_crew('Private catalog fixture');
 do $$declare cid uuid; path text;begin
 select crew_id into cid from public.community_settings where singleton;
 insert into public.challenges(id,crew_id,title,description,evidence,festival,difficulty,points)
 values('${legacy}',cid,'Historische catalogusfixture','Een historische inzending behouden bij de catalogusupdate.','Een foto met toestemming.','DGTL','No Shame',55);
 path:=cid::text||'/${users[0]}/${submission}.jpg';
 insert into storage.objects(bucket_id,name) values('crew-evidence',path);
 perform public.submit_evidence(cid,'${legacy}',path,'image/jpeg','${submission}');
 perform set_config('request.jwt.claim.sub','${users[1]}',false);perform public.review_submission('${submission}',true);
 perform set_config('request.jwt.claim.sub','${users[2]}',false);perform public.review_submission('${submission}',true);
 end$$;
 `);
  const retained = [
    "auth.users",
    "public.profiles",
    "public.records",
    "public.consents",
    "public.submissions",
    "public.reviews",
    "public.awards",
    "public.team_lineup",
    "public.team_settings",
    "storage.objects",
  ];
  const snapshot = () =>
    sql(
      retained
        .map(
          (t) =>
            `select '${t}',md5(coalesce(string_agg(row_to_json(x)::text,',' order by row_to_json(x)::text),'')) from ${t} x;`,
        )
        .join("\n") +
        "\nselect md5(string_agg(row_to_json(x)::text,',' order by row_to_json(x)::text)) from public.challenges x where crew_id<>(select crew_id from public.community_settings);",
    );
  const before = snapshot();
  const active = () =>
    sql(
      "select title||'|'||difficulty||'|'||points||'|'||festival from public.challenges where crew_id=(select crew_id from public.community_settings) and active order by id;",
    )
      .trim()
      .split("\n");
  sql(upgrade);
  const rows = active();
  if (
    rows.length !== 13 ||
    rows.filter((s) => s.includes("|Easy|10|ADE")).length !== 7 ||
    rows.filter((s) => s.includes("|Awkward|30|ADE")).length !== 3 ||
    rows.filter((s) => s.includes("|Legendary|100|ADE")).length !== 3
  )
    throw new Error("Incorrect catalog distribution");
  if (snapshot() !== before)
    throw new Error(
      "Upgrade changed accounts, history, points, media, privacy, lineup or private crews",
    );
  const checks = sql(
    `select active from public.challenges where id='${legacy}';select points from public.awards where submission_id='${submission}';select count(*) from public.challenge_templates;`,
  )
    .trim()
    .split("\n");
  if (JSON.stringify(checks) !== JSON.stringify(["f", "55", "13"]))
    throw new Error(
      "Legacy evidence/points or future crew templates changed incorrectly",
    );
  sql(upgrade);
  if (
    snapshot() !== before ||
    JSON.stringify(active()) !== JSON.stringify(rows)
  )
    throw new Error("Repeated upgrade was not stable");
  console.log(
    "ADE catalog verified: 13 challenges (7x10, 3x30, 3x100), legacy archived, historical evidence and 55 awarded points retained, private crews/consent/accounts unchanged, repeat-safe.",
  );
} finally {
  if (created) docker(["dropdb", "-U", "postgres", "--force", database]);
}
