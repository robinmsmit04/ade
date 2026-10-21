// Only disposable localhost services. Never accepts credentials or a hosted database URL.
import { execFileSync } from "node:child_process";
function localSql(crewId: string, id: string, statement: string) {
  const url = process.env.TEST_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw new Error("Browser admin fixtures require the local Docker database");
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(crewId) || !uuid.test(id))
    throw new Error("Invalid fixture UUID");
  execFileSync(
    "docker",
    [
      "exec",
      "crew-db",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      statement,
    ],
    { stdio: "pipe" },
  );
}
export function localAdmin(
  crewId: string,
  userId: string,
  selectionManager = false,
) {
  localSql(
    crewId,
    userId,
    `update public.members set role='admin' where crew_id='${crewId}' and user_id='${userId}';${selectionManager ? `update public.team_settings set manager_id='${userId}',version=version+1 where crew_id='${crewId}';` : ""}`,
  );
  // Undo this fixture's synthetic admin role before ordinary account deletion.
  return () =>
    localSql(
      crewId,
      userId,
      `update public.members set role='member' where crew_id='${crewId}' and user_id='${userId}';`,
    );
}
export function localDeleteChallenge(crewId: string, challengeId: string) {
  localSql(
    crewId,
    challengeId,
    `delete from public.challenges where crew_id='${crewId}' and id='${challengeId}';`,
  );
}
