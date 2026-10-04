import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { supabaseConfig } from "./supabase-lib.mts";

export const COOKIE_NAME = "hh_session";
const SESSION_SECRET_KEY = "hercules:session-secret:v2";

function store() { return getStore({ name: "hercules-auth", consistency: "strong" }); }
async function sessionSecret() {
  const explicit = Netlify.env.get("HERCULES_SESSION_SECRET")?.trim();
  if (explicit) return explicit;
  const supa=supabaseConfig();
  if(supa.secret) return createHash("sha256").update(`hercules-session:${supa.secret}`).digest("hex");
  let s: ReturnType<typeof store> | null = null;
  try { s = store(); } catch {}
  let value: string | null = null;
  if (s) {
    try { value = await s.get(SESSION_SECRET_KEY, { type: "text", consistency: "strong" }); } catch {}
    if (value) return value;
    const created = randomBytes(48).toString("base64url");
    try {
      const result = await s.set(SESSION_SECRET_KEY, created, { onlyIfNew: true });
      if (result?.modified) return created;
      const winner = await s.get(SESSION_SECRET_KEY, { type: "text", consistency: "strong" });
      if (winner) return winner;
    } catch {}
  }
  throw new Error("session_secret_unavailable");
}
async function sign(payload: string) { return createHmac("sha256", await sessionSecret()).update(payload).digest("base64url"); }
export type SessionPayload={scope:"hercules",subject:string,provider:"device",exp:number};
export function normalizeDeviceId(raw:string){
  const id=String(raw||"").trim();
  if(!/^[A-Za-z0-9._:-]{16,128}$/.test(id))throw new Error("invalid_device_id");
  return id;
}
export function deviceSubject(deviceId:string){
  const id=normalizeDeviceId(deviceId);
  return `device:${createHash("sha256").update(id).digest("hex")}`;
}
export async function makeDeviceSession(deviceId:string) {
  const data:SessionPayload={scope:"hercules",subject:deviceSubject(deviceId),provider:"device",exp:Date.now()+365*24*60*60*1000};
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${await sign(payload)}`;
}
export async function readSession(req: Request):Promise<SessionPayload|null> {
  const cookie = req.headers.get("cookie") || "";
  const raw = cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE_NAME+"="))?.slice(COOKIE_NAME.length+1);
  if(!raw) return null;
  const [payload, sig] = raw.split("."); if(!payload || !sig) return null;
  const expected = await sign(payload);
  try {
    const A=Buffer.from(sig),B=Buffer.from(expected);if(A.length!==B.length||!timingSafeEqual(A,B))return null;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(data.scope!=="hercules"||data.provider!=="device"||Number(data.exp)<=Date.now()||typeof data.subject!=="string"||!data.subject.startsWith("device:"))return null;
    return data as SessionPayload;
  } catch { return null; }
}
export async function verifySession(req: Request) { return !!(await readSession(req)); }
export function sessionCookie(req: Request, token: string, maxAge=31536000) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
