import type { SupabaseClient } from "@supabase/supabase-js";
import { validateMedia } from "./domain";
// A fixed request/path makes retries safe after an ambiguous upload or RPC response.
export async function storeEvidence(
  client: SupabaseClient,
  values: {
    cid: string;
    challenge: string;
    file: File;
    id: string;
    path: string;
  },
) {
  validateMedia(values.file);
  const uploaded = await client.storage
    .from("crew-evidence")
    .upload(values.path, values.file, {
      contentType: values.file.type,
      upsert: false,
    });
  if (uploaded.error) {
    const duplicate =
      ("statusCode" in uploaded.error &&
        String(uploaded.error.statusCode) === "409") ||
      /already exists/i.test(uploaded.error.message);
    if (!duplicate)
      throw new Error(
        `Upload mislukt: ${uploaded.error.message}. Je bestand en toestemming blijven geselecteerd.`,
      );
  }
  const submitted = await client.rpc("submit_evidence", {
    cid: values.cid,
    challenge: values.challenge,
    path: values.path,
    mime: values.file.type,
    request_id: values.id,
  });
  if (submitted.error)
    throw new Error(
      `Inzenden mislukt: ${submitted.error.message}. De inzending is niet bevestigd. Je bestand en toestemming blijven geselecteerd; probeer opnieuw.`,
    );
}
