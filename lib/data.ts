import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordEntry } from "./domain";
// Server-side date filtering uses Europe/Amsterdam and still obeys caller RLS.
export async function fetchRecords(
  client: SupabaseClient,
  crewId: string,
  limit: number,
  filters: { owner?: string; day?: string; label?: string } = {},
) {
  const rows: RecordEntry[] = [];
  for (let offset = 0; offset < limit; offset += 100) {
    const { data, error } = await client
      .rpc("visible_timeline", {
        cid: crewId,
        owner_filter: filters.owner || null,
        day_filter: filters.day || null,
        label_filter: filters.label || null,
      })
      .range(offset, Math.min(offset + 99, limit - 1));
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < 100) break;
  }
  return { data: rows, error: null };
}
