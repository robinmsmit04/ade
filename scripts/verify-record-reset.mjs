// Verify the records-only cleanup in a disposable COPY of localhost's database.
// Never accepts remote URLs; never prints credentials or database dumps.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const database = `record_reset_verification_${Date.now()}`;
const ids = Array.from({ length: 3 }, () => randomUUID());
const reset = readFileSync(
  new URL("../docs/reset-registraties.sql", import.meta.url),
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
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,email_confirmed_at) values ${ids.map((id) => `('${id}','record-reset-${id}@example.invalid','{}','{}',now())`).join(",")};
 select set_config('request.jwt.claim.sub','${ids[0]}',false);
 do $$declare cid uuid; private_cid uuid;ch uuid;sid uuid:=gen_random_uuid();path text;begin
 select crew_id into cid from public.community_settings where singleton;
 private_cid:=public.create_crew('Records-only reset fixture');
 insert into public.records(crew_id,user_id,substance) values(private_cid,'${ids[0]}','Privéfixture'),(cid,'${ids[1]}','Gemeenschappelijke fixture');
 insert into public.checkins(crew_id,user_id,status,shared) values(cid,'${ids[0]}','Goed',true);
 insert into public.party_state(crew_id,user_id,ended_at) values(cid,'${ids[0]}',now());
 update public.consents set sharing=true where user_id='${ids[0]}';
 path:='${ids[0]}/'||gen_random_uuid()::text||'.jpg';
 insert into storage.objects(bucket_id,name) values('profile-photos',path);
 perform public.save_my_profile('Bewaard profiel',path);
 insert into public.match_reports(crew_id,author_id,title,body) values(cid,'${ids[0]}','Bewaard wedstrijdverslag','Dit verslag moet ook na de registratie-reset blijven bestaan.');
 select id into ch from public.challenges where crew_id=cid and active limit 1;
 path:=cid::text||'/${ids[0]}/'||sid::text||'.jpg';
 insert into storage.objects(bucket_id,name) values('crew-evidence',path);
 perform public.submit_evidence(cid,ch,path,'image/jpeg',sid);
 perform set_config('request.jwt.claim.sub','${ids[1]}',false);perform public.review_submission(sid,true);
 perform set_config('request.jwt.claim.sub','${ids[2]}',false);perform public.review_submission(sid,true);
 end$$;
 `);
  const tables = sql(
    "select tablename from pg_tables where schemaname='public' and tablename not in('records','activity') order by tablename;",
  )
    .trim()
    .split("\n")
    .map((t) => `public.${t}`);
  tables.push("auth.users", "storage.objects");
  const snapshot = () =>
    sql(
      tables
        .map(
          (t) =>
            `select '${t}',md5(coalesce(string_agg(row_to_json(x)::text,',' order by row_to_json(x)::text),'')) from ${t} x;`,
        )
        .join("\n"),
    );
  const before = snapshot();
  sql(reset);
  if (sql("select count(*) from public.records;").trim() !== "0")
    throw Error("Registrations were not cleared");
  if (snapshot() !== before)
    throw Error("Records-only reset changed other app data");
  sql(reset);
  if (snapshot() !== before)
    throw Error("Repeated reset changed retained data");
  sql(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${ids[0]}',true);
 insert into public.records(crew_id,substance) select crew_id,'Nieuwe registratie na reset' from public.members where user_id='${ids[0]}' limit 1;rollback;`);
  console.log(
    "Records-only reset verified: registrations cleared across crews; every other public data table, users, photos, points, reports, lineup and consent retained; repeat-safe; authenticated registration still works.",
  );
} finally {
  if (created) docker(["dropdb", "-U", "postgres", "--force", database]);
}
