// Disposable database copy inside the existing LOCAL Docker container only.
// Never accepts a remote database URL and never prints the dump or account data.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const database = `crew_reset_verification_${Date.now()}`;
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
const sql = (text) =>
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
    text,
  );
const reset = readFileSync(
  new URL("../docs/reset-test-data.sql", import.meta.url),
  "utf8",
);
const ids = Array.from({ length: 3 }, () => randomUUID());
let created = false;
try {
  docker(["createdb", "-U", "postgres", "-T", "template0", database]);
  created = true;
  const dump = docker([
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--clean",
    "--if-exists",
    "--no-owner",
  ]);
  sql(dump);
  // These are synthetic metadata fixtures in a database copy, with no Storage service attached.
  sql(`
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at)
 values ${ids.map((id) => `('${id}','reset-${id}@example.invalid','{}','{}',now())`).join(",")};
 select set_config('request.jwt.claim.sub','${ids[0]}',false);
 do $$declare cid uuid; sid uuid:=gen_random_uuid(); path text; ch public.challenges;begin
  select crew_id into cid from public.community_settings where singleton;
  update public.members set role='admin' where crew_id=cid and user_id='${ids[0]}';
  select * into ch from public.challenges where crew_id=cid limit 1;
  path:=cid::text||'/${ids[0]}/'||sid::text||'.jpg';
  insert into storage.objects(bucket_id,name) values('crew-evidence',path);
  perform public.submit_evidence(cid,ch.id,path,'image/jpeg',sid);
  perform set_config('request.jwt.claim.sub','${ids[1]}',false);
  perform public.post_submission_comment(sid,'Synthetic reset fixture',gen_random_uuid());
  perform public.review_submission(sid,true);
  perform set_config('request.jwt.claim.sub','${ids[2]}',false);
  perform public.review_submission(sid,true);
  perform set_config('request.jwt.claim.sub','${ids[0]}',false);
  insert into public.records(crew_id,user_id,substance) values(cid,'${ids[0]}','Reset fixture');
  insert into public.checkins(crew_id,user_id,status) values(cid,'${ids[0]}','Goed');
  perform public.end_my_party(cid);
  perform public.create_invite(cid);
  update public.consents set sharing=true where crew_id=cid and user_id='${ids[0]}';
  insert into storage.objects(bucket_id,name) values('profile-photos','${ids[0]}/'||gen_random_uuid()::text||'.jpg');
 end$$;
 `);
  const preserved = [
    "auth.users",
    "public.profiles",
    "public.members",
    "public.crews",
    "public.challenges",
    "public.challenge_templates",
    "public.community_settings",
  ];
  const snapshot = () =>
    sql(
      preserved
        .map(
          (t) =>
            `select '${t}',md5(coalesce(string_agg(row_to_json(x)::text,',' order by row_to_json(x)::text),'')) from ${t} x;`,
        )
        .join("\n") +
        "\nselect count(*) from storage.objects where bucket_id='profile-photos';",
    );
  const before = snapshot();
  let blocked = false;
  try {
    sql(reset);
  } catch (e) {
    blocked = String(e.stderr).includes("Verwijder eerst alle bestanden");
  }
  if (!blocked) throw new Error("Storage guard did not block the reset");
  if (snapshot() !== before)
    throw new Error("A blocked reset changed retained data");
  // Model completed Storage API removal in the isolated COPY, not in the app's database.
  // Disable the Storage SQL-deletion guard ONLY in the disposable copy to model
  // the state after dashboard/API removal. No real object service uses this copy.
  sql(
    "begin; alter table storage.objects disable trigger user; delete from storage.objects where bucket_id='crew-evidence'; alter table storage.objects enable trigger user; commit;",
  );
  sql(reset);
  if (snapshot() !== before)
    throw new Error(
      "Reset changed accounts, roles, profiles, challenge settings or avatars",
    );
  const content = [
    "records",
    "checkins",
    "submissions",
    "reviews",
    "awards",
    "submission_comments",
    "social_notifications",
    "party_state",
    "invites",
    "activity",
  ];
  const leftovers = sql(
    content.map((t) => `select count(*) from public.${t};`).join("\n") +
      "\nselect count(*) from public.consents where sharing;",
  )
    .trim()
    .split("\n");
  if (leftovers.some((x) => x !== "0"))
    throw new Error("Content remained after reset");
  sql(reset);
  if (snapshot() !== before)
    throw new Error("Repeat reset changed retained data");
  // A new confirmed friend can still join with ordinary member rights and sharing off.
  const friend = randomUUID();
  sql(`begin;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at) values('${friend}','friend-${friend}@example.invalid','{}','{}',now());
 set local role authenticated;
 select set_config('request.jwt.claim.sub','${friend}',true);
 do $$declare cid uuid;begin
  cid:=public.ensure_community_membership();
  if not public.is_member(cid) then raise exception 'New friend could not join';end if;
  if not exists(select 1 from public.members where crew_id=cid and user_id=auth.uid() and role='member') then raise exception 'Unexpected role';end if;
  if exists(select 1 from public.consents where user_id=auth.uid() and sharing) then raise exception 'Sharing unexpectedly on';end if;
 end$$;
 rollback;`);
  console.log(
    "Reset verified: Storage guard, all app content removed, accounts/profiles/roles/challenges/avatars retained, sharing off, repeat-safe, confirmed friend can join.",
  );
} catch (e) {
  const safe = e.stderr
    ? String(e.stderr)
        .split("\n")
        .filter((s) => s.startsWith("ERROR:"))
        .join("\n")
    : e.message;
  console.error(safe || "Local reset verification failed.");
  process.exitCode = 1;
} finally {
  if (created) docker(["dropdb", "-U", "postgres", database]);
}
