/** Opaque cookies identify server-owned sessions; identity headers are never used. */
export const SESSION_COOKIE = '__Host-mets_session';
const LOCAL_COOKIE = 'mets_session_local';
export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfter?: number) { super(message); }
}
export type Session = { token_hash: string; user_id: string; role: 'host' | 'guest'; expires_at: number };
export const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), n => n.toString(16).padStart(2, '0')).join('');
const cookieName = (req: Request) => new URL(req.url).protocol === 'https:' ? SESSION_COOKIE : LOCAL_COOKIE;
export function sessionCookie(req: Request, token: string, maxAge: number) {
  return `${cookieName(req)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function getSession(db: D1Database, req: Request): Promise<Session | null> {
  const values = (req.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(cookieName(req) + '='));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName(req).length + 1);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare('SELECT token_hash,user_id,role,expires_at FROM sessions WHERE token_hash=? AND expires_at>?').bind(await digest(token), Date.now()).first<Session>();
}
export async function issueSession(db: D1Database, role: 'host' | 'guest') {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  const maxAge = role === 'host' ? 8 * 3600 : 7 * 86400;
  const session: Session = { token_hash: await digest(token), user_id: crypto.randomUUID(), role, expires_at: Date.now() + maxAge * 1000 };
  await db.prepare('INSERT INTO sessions (token_hash,user_id,role,expires_at) VALUES (?,?,?,?)').bind(session.token_hash,session.user_id,role,session.expires_at).run();
  return { session, token, maxAge };
}
export async function rateLimit(db: D1Database, key: string, limit: number, seconds: number) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO rate_limits (key,hits,reset_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING hits,reset_at`)
    .bind(key, now + seconds * 1000, now, now).first<{hits:number;reset_at:number}>();
  if (!row || row.hits > limit) throw new HttpError(429, 'Too many attempts. Please wait and try again.', Math.max(1, Math.ceil(((row?.reset_at || now + seconds * 1000) - now) / 1000)));
}
export async function passwordValid(password: unknown, secret: string | undefined) {
  if (!secret || secret.length < 20) throw new HttpError(503, 'Host access has not been configured.');
  if (typeof password !== 'string' || password.length > 256) return false;
  const a = await digest(password), b = await digest(secret);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
export async function readAction(req: Request) {
  if (req.headers.get('origin') !== new URL(req.url).origin || req.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Invalid request origin.');
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new HttpError(415, 'Send JSON requests.');
  const limit = 150000;
  if (Number(req.headers.get('content-length') || 0) > limit) throw new HttpError(413, 'Question file is too large.');
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, 'A request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new HttpError(413, 'Question file is too large.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { const action = JSON.parse(new TextDecoder().decode(bytes)); if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.type !== 'string') throw new Error(); return action; }
  catch { throw new HttpError(400, 'Invalid game request.'); }
}
