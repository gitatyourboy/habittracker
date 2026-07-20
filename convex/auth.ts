import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 8;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameSecret(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function normalizeProfileName(value: string) {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

export async function requireSession(ctx: any, profileId: string, sessionToken: string) {
  if (!profileId || sessionToken.length < 32) throw new Error("AUTH_REQUIRED");
  const tokenHash = await sha256(sessionToken);
  const session = await ctx.db.query("profile_sessions").withIndex("by_token", (q: any) => q.eq("token_hash", tokenHash)).unique();
  if (!session || session.profile_id !== profileId || session.expires_at <= Date.now()) {
    throw new Error("AUTH_REQUIRED");
  }
  return session;
}

export const challenge = query({
  args: { profileId: v.string() },
  handler: async (ctx, { profileId }) => {
    const profile = await ctx.db.query("cloud_profiles").withIndex("by_profile", (q) => q.eq("profile_id", profileId)).unique();
    return profile ? { registered: true, pinSalt: profile.pin_salt } : { registered: false, pinSalt: null };
  },
});

// A fresh device does not have the random profile id stored in localStorage.
// Resolve the human-friendly profile name first so it can perform the normal,
// rate-limited PIN login without creating a second cloud profile.
export const resolveByName = query({
  args: { profileName: v.string() },
  handler: async (ctx, { profileName }) => {
    const loginName = normalizeProfileName(profileName);
    if (!loginName || loginName.length > 80) return null;

    const indexed = await ctx.db.query("cloud_profiles")
      .withIndex("by_login_name", (q) => q.eq("login_name", loginName)).collect();
    const matches = indexed.length ? indexed : (await ctx.db.query("cloud_profiles").collect())
      .filter((profile) => normalizeProfileName(profile.name) === loginName);
    if (matches.length > 1) throw new Error("PROFILE_NAME_AMBIGUOUS");
    const profile = matches[0];
    return profile ? { profileId: profile.profile_id, profileName: profile.name, pinSalt: profile.pin_salt } : null;
  },
});

export const register = mutation({
  args: {
    profileId: v.string(), profileName: v.string(), pinSalt: v.string(), pinProof: v.string(),
    sessionToken: v.string(), registrationCode: v.string(),
  },
  handler: async (ctx, args) => {
    const expectedCode = process.env.PROFILE_REGISTRATION_CODE;
    if (!expectedCode || !sameSecret(args.registrationCode, expectedCode)) throw new Error("REGISTRATION_DENIED");
    if (!/^[a-zA-Z0-9_-]{6,128}$/.test(args.profileId)) throw new Error("INVALID_PROFILE");
    if (args.profileName.trim().length < 1 || args.profileName.length > 80) throw new Error("INVALID_PROFILE");
    if (args.pinSalt.length < 32 || args.pinProof.length !== 64 || args.sessionToken.length < 32) throw new Error("INVALID_CREDENTIALS");

    const loginName = normalizeProfileName(args.profileName);
    const existing = await ctx.db.query("cloud_profiles").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    if (existing) throw new Error("PROFILE_ALREADY_REGISTERED");
    const duplicateName = (await ctx.db.query("cloud_profiles").collect())
      .some((profile) => normalizeProfileName(profile.name) === loginName);
    if (duplicateName) throw new Error("PROFILE_NAME_TAKEN");
    const now = Date.now();
    await ctx.db.insert("cloud_profiles", {
      profile_id: args.profileId, name: args.profileName.trim(), login_name: loginName, pin_salt: args.pinSalt,
      pin_proof: args.pinProof, created_at: now,
    });

    // The first registered local profile claims the verified Supabase snapshot.
    const unclaimed = await ctx.db.query("app_state").withIndex("by_profile", (q) => q.eq("profile_id", undefined)).first();
    if (unclaimed) await ctx.db.patch(unclaimed._id, { profile_id: args.profileId });

    const tokenHash = await sha256(args.sessionToken);
    const expiresAt = now + SESSION_LIFETIME_MS;
    await ctx.db.insert("profile_sessions", {
      profile_id: args.profileId, token_hash: tokenHash, created_at: now, expires_at: expiresAt,
    });
    return { expiresAt };
  },
});

export const login = mutation({
  args: { profileId: v.string(), pinProof: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const attempt = await ctx.db.query("login_attempts").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    if (attempt?.locked_until && attempt.locked_until > now) throw new Error("LOGIN_LOCKED");

    const profile = await ctx.db.query("cloud_profiles").withIndex("by_profile", (q) => q.eq("profile_id", args.profileId)).unique();
    const valid = Boolean(profile && sameSecret(args.pinProof, profile.pin_proof));
    if (!valid) {
      const insideWindow = Boolean(attempt && now - attempt.window_start < LOGIN_WINDOW_MS);
      const count = insideWindow ? attempt!.count + 1 : 1;
      const values = {
        count, window_start: insideWindow ? attempt!.window_start : now,
        locked_until: count >= MAX_LOGIN_FAILURES ? now + LOGIN_WINDOW_MS : undefined,
      };
      if (attempt) await ctx.db.patch(attempt._id, values);
      else await ctx.db.insert("login_attempts", { profile_id: args.profileId, ...values });
      throw new Error("INVALID_CREDENTIALS");
    }

    if (attempt) await ctx.db.delete(attempt._id);
    const tokenHash = await sha256(args.sessionToken);
    const expiresAt = now + SESSION_LIFETIME_MS;
    await ctx.db.insert("profile_sessions", {
      profile_id: args.profileId, token_hash: tokenHash, created_at: now, expires_at: expiresAt,
    });
    return { expiresAt };
  },
});

export const logout = mutation({
  args: { profileId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.profileId, args.sessionToken);
    await ctx.db.delete(session._id);
    return { signedOut: true };
  },
});
