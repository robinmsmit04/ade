"use client";
import { createBrowserClient } from "@supabase/ssr";
export const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export function getSupabase() {
  if (!configured)
    throw new Error("Supabase is nog niet gekoppeld. Zie SETUP.md.");
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
