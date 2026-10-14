// add_user: the only way the app creates or changes logins.
//
// Actions: create | update_password | update_email | delete | set_status.
// The caller must be an active admin, or a partner office (CPO) whose login
// type is switched on, managing the manager / dealer logins under itself.
// Activate and deactivate only through set_status. The login type is written to
// app_metadata, which users cannot edit; the database trigger and the profile
// row both take it from there.
//
// Secrets: none to set. SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase. Optional ALLOWED_ORIGIN
// (comma-separated) limits which sites may call it, e.g. https://crm.example.in

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

type Profile = {
  id: string;
  name: string;
  email: string | null;
  user_type: string;
  status: string;
  channel_partner: string | null;
  cpo_profile_id: string | null;
};

const CPO_CHILD_TYPES = ["office2", "agent2"];
// Placeholder for accounts nobody set up; never created or activated here.
const PENDING_TYPE = "pending";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGIN") || "").split(",").map((o) => o.trim()).filter(Boolean);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.length === 0 ? "*" : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(allow === "*" ? {} : { Vary: "Origin" }),
  };
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

function requireId(value: unknown): string {
  const id = text(value);
  if (!UUID.test(id)) throw new HttpError(400, "user_id is required.");
  return id;
}

function requireEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, "A valid email address is required.");
  return email;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const origin = req.headers.get("Origin");
    if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
      throw new HttpError(403, "Access denied: this site may not manage logins.");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey) throw new HttpError(500, "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    const options = { auth: { autoRefreshToken: false, persistSession: false } };
    const service = createClient(url, serviceKey, options);
    const authClient = createClient(url, anonKey || serviceKey, options);

    // ── Who is calling ──────────────────────────────────────────────
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) throw new HttpError(401, "Unauthorized: no token. Sign in again.");
    const { data: auth, error: authError } = await authClient.auth.getUser(token);
    if (authError || !auth?.user) throw new HttpError(401, "Unauthorized: invalid or expired session. Sign in again.");

    const loginType = async (userType: string) => {
      const { data } = await service.from("app_roles").select("user_type, role, enabled").eq("user_type", userType).maybeSingle();
      return data as { user_type: string; role: string; enabled: boolean } | null;
    };

    const { data: caller } = await service.from("profiles")
      .select("id, name, email, user_type, status, channel_partner, cpo_profile_id")
      .eq("id", auth.user.id).maybeSingle<Profile>();
    const isAdmin = caller?.status === "active" && caller.user_type === "admin";
    const isCpo = caller?.status === "active" && caller.user_type === "channel_partner_office";
    if (!caller || (!isAdmin && !isCpo) || !(await loginType(caller.user_type))?.enabled) {
      throw new HttpError(403, "Forbidden: only an active Admin or Channel Partner Office can manage logins.");
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "Request body must be JSON.");
    }
    const action = text(body.action) || "create";

    const enabledRole = async (userType: string) => {
      if (userType === PENDING_TYPE) throw new HttpError(400, "Choose a login type for this user first.");
      const data = await loginType(userType);
      if (!data) throw new HttpError(400, `Unknown login type "${userType}".`);
      if (!data.enabled) throw new HttpError(400, `${userType} logins are switched off for this company.`);
      return data;
    };

    // A CPO may only touch the manager / dealer logins under itself.
    const loadTarget = async (userId: string) => {
      const { data: target } = await service.from("profiles")
        .select("id, name, email, user_type, status, channel_partner, cpo_profile_id")
        .eq("id", userId).maybeSingle<Profile>();
      if (isCpo && (!target || target.cpo_profile_id !== caller.id || !CPO_CHILD_TYPES.includes(target.user_type))) {
        throw new HttpError(403, "Forbidden: you can only manage logins in your own office.");
      }
      return target;
    };
    const notSelf = (userId: string, what: string) => {
      if (userId === caller.id) throw new HttpError(400, `You cannot ${what} your own login.`);
    };

    // ── create ──────────────────────────────────────────────────────
    if (action === "create") {
      const email = requireEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      if (!password) throw new HttpError(400, "Email and password are required.");
      const userType = text(body.user_type) || "sales";
      if (isCpo && !CPO_CHILD_TYPES.includes(userType)) {
        throw new HttpError(403, "Forbidden: a partner office can only create manager and dealer logins.");
      }
      const role = await enabledRole(userType);
      const name = (text(body.name) || email.split("@")[0]).toUpperCase();

      let channelPartner: string | null = text(body.channel_partner) || null;
      let parentId: string | null = null;
      if (isCpo) {
        channelPartner = caller.channel_partner || caller.name;
        parentId = caller.id;
      } else if (CPO_CHILD_TYPES.includes(userType)) {
        // Admin creating a manager/dealer: it works under one active partner office
        // (linked as its parent), or a dealer under one channel partner. Either way
        // it takes that parent's partner key.
        const requested = text(body.parent_profile_id);
        const parentTypes = userType === "agent2" ? ["channel_partner_office", "agent"] : ["channel_partner_office"];
        const what = userType === "agent2" ? "partner office or channel partner" : "partner office";
        if (!UUID.test(requested) && !channelPartner) throw new HttpError(400, `Choose the ${what} this login works under.`);
        const parents = service.from("profiles").select("id, name, user_type, channel_partner")
          .in("user_type", parentTypes).eq("status", "active");
        const { data } = await (UUID.test(requested) ? parents.eq("id", requested) : parents.ilike("channel_partner", likeLiteral(channelPartner!))).limit(2);
        if (!data?.length) throw new HttpError(400, `The ${what} this login works under was not found or is switched off.`);
        if (data.length > 1) throw new HttpError(400, `More than one ${what} is named "${channelPartner}". Choose it from the list instead.`);
        const parent = data[0];
        channelPartner = text(parent.channel_partner) || parent.name;
        if (parent.user_type === "channel_partner_office") parentId = parent.id;
      } else if (userType === "agent") {
        // A channel partner sees the leads filed under this key; it never follows later renames.
        channelPartner = channelPartner || name;
      }

      const appMetadata = {
        created_via: "add_user",
        user_type: userType,
        // A partner office cannot choose the label of the logins it creates.
        role: (isCpo ? "" : text(body.role)) || role.role,
        channel_partner: channelPartner,
        parent_profile_id: parentId,
        created_by: caller.id,
        name,
      };
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: { name },
      });
      if (createError || !created?.user) throw new HttpError(400, createError?.message || "Could not create the login.");

      const { error: profileError } = await service.from("profiles").upsert({
        id: created.user.id,
        name,
        email,
        phone_number: text(body.phone) || null,
        user_type: userType,
        role: appMetadata.role,
        channel_partner: channelPartner,
        parent_profile_id: parentId,
        created_by: caller.id,
        status: "active",
      }, { onConflict: "id" });
      if (profileError) {
        await service.auth.admin.deleteUser(created.user.id);
        throw new HttpError(500, `Login was not created: ${profileError.message}`);
      }

      if (userType === "vendor") {
        // Claim the matching Operations vendor row so only this login sees its jobs.
        const { data: vendors } = await service.from("vendors").select("id, name, email").is("profile_id", null);
        const match = (vendors || []).find((v) =>
          text(v.email).toLowerCase() === email || text(v.name).toLowerCase() === name.toLowerCase());
        if (match) await service.from("vendors").update({ profile_id: created.user.id }).eq("id", match.id);
      }

      return reply(200, { success: true, user: created.user });
    }

    // ── changes to an existing login ────────────────────────────────
    const userId = requireId(body.user_id);
    const target = await loadTarget(userId);

    if (action === "update_password") {
      const password = typeof body.new_password === "string" ? body.new_password : "";
      if (!password) throw new HttpError(400, "user_id and new_password are required.");
      const { error } = await service.auth.admin.updateUserById(userId, { password });
      if (error) throw new HttpError(400, error.message);
      return reply(200, { success: true });
    }

    if (action === "update_email") {
      const email = requireEmail(body.new_email);
      const { error } = await service.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw new HttpError(400, error.message);
      await service.from("profiles").update({ email }).eq("id", userId);
      return reply(200, { success: true });
    }

    if (action === "set_status") {
      notSelf(userId, "deactivate");
      const status = text(body.status);
      if (status !== "active" && status !== "inactive") throw new HttpError(400, "status must be active or inactive.");
      if (!target) throw new HttpError(404, "User not found.");
      if (status === "active") await enabledRole(target.user_type);
      const { error } = await service.from("profiles").update({ status }).eq("id", userId);
      if (error) throw new HttpError(400, error.message);
      // A ban also ends the user's current sessions at their next token refresh.
      await service.auth.admin.updateUserById(userId, { ban_duration: status === "active" ? "none" : "876000h" });
      return reply(200, { success: true });
    }

    if (action === "delete") {
      notSelf(userId, "delete");
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) throw new HttpError(400, error.message);
      await service.from("profiles").delete().eq("id", userId);
      return reply(200, { success: true });
    }

    throw new HttpError(400, `Unknown action "${action}"`);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal server error";
    return reply(status, { error: message });
  }
});
