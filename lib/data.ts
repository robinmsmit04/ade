import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordEntry } from "./domain";
// Range requests avoid Supabase's default 1,000-row response cap for older history.
export async function fetchRecords(
  client: SupabaseClient,
  crewId: string,
  limit: number,
) {
  const rows: RecordEntry[] = [];
  for (let offset = 0; offset < limit; offset += 100) {
    const { data, error } = await client
      .from("records")
      .select("*")
      .eq("crew_id", crewId)
      .order("taken_at", { ascending: false })
      .order("id")
      .range(offset, Math.min(offset + 99, limit - 1));
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < 100) break;
  }
  return { data: rows, error: null };
}
