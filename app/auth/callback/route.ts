import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") || "/";
  const safeNext = /^\/invite\/[a-f0-9]{48}$/.test(next) ? next : "/";
  const response = NextResponse.redirect(new URL(safeNext, request.url));
  if (
    code &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) =>
            cookies.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            ),
        },
      },
    );
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error)
      return NextResponse.redirect(new URL("/?auth_error=1", request.url));
  }
  return response;
}
