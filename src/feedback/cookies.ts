import type { ViewerIdentity, Vote } from "./contracts.js";

const SESSION = "agent_radar_session";
const STATE = "agent_radar_oauth_state";
const encoder = new TextEncoder();

interface Envelope<T> { v: 1; exp: number; data: T }
export interface OAuthState { nonce: string; return_path: string; tool_id?: string; vote?: Vote }

export async function issueSessionCookie(identity: ViewerIdentity, secret: string, now = new Date()): Promise<string> {
  return cookie(SESSION, await seal(identity, secret, now.getTime() + 30 * 86400_000), 30 * 86400);
}
export async function readSessionCookie(header: string | null, secret: string, now = new Date()): Promise<ViewerIdentity | null> {
  return open<ViewerIdentity>(readCookie(header, SESSION), secret, now);
}
export async function issueOAuthStateCookie(state: OAuthState, secret: string, now = new Date()): Promise<string> {
  return cookie(STATE, await seal(state, secret, now.getTime() + 10 * 60_000), 600);
}
export async function readOAuthStateCookie(header: string | null, secret: string, nonce: string, now = new Date()): Promise<OAuthState | null> {
  const value = await open<OAuthState>(readCookie(header, STATE), secret, now);
  return value?.nonce === nonce ? value : null;
}
export function clearSessionCookie(): string { return cookie(SESSION, "", 0); }
export function clearOAuthStateCookie(): string { return cookie(STATE, "", 0); }

async function seal<T>(data: T, secret: string, expires: number): Promise<string> {
  assertSecret(secret);
  const payload = base64url(encoder.encode(JSON.stringify({ v: 1, exp: expires, data } satisfies Envelope<T>)));
  return `${payload}.${base64url(await sign(payload, secret))}`;
}

async function open<T>(value: string | null, secret: string, now: Date): Promise<T | null> {
  try {
    assertSecret(secret); if (!value) return null;
    const [payload, signature, extra] = value.split("."); if (!payload || !signature || extra) return null;
    const expected = await sign(payload, secret); const actual = unbase64url(signature);
    if (actual.length !== expected.length || !actual.every((byte, index) => byte === expected[index])) return null;
    const envelope = JSON.parse(new TextDecoder().decode(unbase64url(payload))) as Envelope<T>;
    if (envelope.v !== 1 || envelope.exp <= now.getTime()) return null;
    return envelope.data;
  } catch { return null; }
}

async function sign(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}
function assertSecret(secret: string) { if (encoder.encode(secret).length < 32) throw new Error("Session secret must be at least 32 bytes"); }
function cookie(name: string, value: string, maxAge: number) { return `${name}=${value}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax; Path=/`; }
function readCookie(header: string | null, name: string): string | null { return header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; }
function base64url(value: Uint8Array) { return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function unbase64url(value: string) { const raw = atob(value.replaceAll("-", "+").replaceAll("_", "/")); return Uint8Array.from(raw, (char) => char.charCodeAt(0)); }
