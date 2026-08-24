import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/server';

/** The app-owned half of a user, mirroring public.profiles. */
export interface Profile {
  id: string;
  full_name: string | null;
  company_name: string | null;
  role: string;
}

/** A user as the UI needs it: identity from auth.users, name from profiles. */
export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  companyName: string | null;
  role: string;
}

/**
 * The signed-in user for server components, or null.
 *
 * Uses `getUser()` rather than `getSession()`: getSession reads the cookie without
 * verifying it, so it can be spoofed. getUser revalidates against the auth server.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // RLS already restricts this to the caller's own row, so the .eq() is defense in depth
  // rather than the thing doing the scoping — it also lets us use maybeSingle().
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, company_name, role')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  return {
    id: user.id,
    email: user.email ?? null,
    // The profile row is created by the on_auth_user_created trigger. Falling back to user
    // metadata covers the instant right after signup if this read races that insert.
    fullName: profile?.full_name ?? (user.user_metadata?.full_name as string) ?? null,
    companyName:
      profile?.company_name ?? (user.user_metadata?.company_name as string) ?? null,
    role: profile?.role ?? 'business_user',
  };
}

type RequireUserResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

/**
 * The gate for any API route that reads or writes user-owned data:
 *
 *   const auth = await requireUser();
 *   if (!auth.ok) return auth.response;
 *   const { supabase, user } = auth;
 *
 * The returned client is the *user-scoped* one, so RLS is what actually enforces ownership
 * on select / update / delete. Inserts still have to set `user_id: user.id` explicitly —
 * the insert policy checks that column, it does not populate it.
 *
 * Never swap this for the service role client to "make a query work": the service role
 * bypasses RLS entirely, and every route using it becomes a cross-tenant data leak. The
 * only legitimate service-role caller in Veyra is the CALL-E webhook, which has no user
 * session to work from.
 */
export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    };
  }

  return { ok: true, supabase, user };
}
