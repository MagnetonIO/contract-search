import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { makeAuthConfig, verifyPassword } from './auth-core.mjs';
import { localDir, readJson, writeJson, ConflictError } from './store';

export type AuthConfig = { username: string; passwordHash: string; sessionSecret: string; resetAllowedUntil?: number };
export function localSetupAllowed(request: Request) {
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  const host = request.headers.get('host');
  return !process.env.VERCEL && Boolean(host) && loopback.includes(new URL(request.url).hostname) && loopback.includes(new URL('http://'+host).hostname);
}
export async function authConfig(): Promise<AuthConfig | null> {
  let value: AuthConfig;
  if (process.env.DASHBOARD_AUTH_CONFIG) value = JSON.parse(process.env.DASHBOARD_AUTH_CONFIG);
  else if (!process.env.VERCEL) {
    try { value = JSON.parse(await readFile(path.join(localDir(), 'auth.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  } else return null;
  if (!value.username || !value.passwordHash || value.sessionSecret?.length < 32) throw new Error('Login configuration is incomplete');
  return value;
}
export async function createLocalAccount(username: string, password: string) {
  if (await authConfig()) throw new Error('A dashboard account already exists.');
  const config = makeAuthConfig(username, password);
  await mkdir(localDir(), { recursive: true });
  await writeFile(path.join(localDir(), 'auth.json'), JSON.stringify(config), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return config;
}
export async function resetLocalAccount(password: string, confirmation: string) {
  const lock = path.join(localDir(), 'reset.lock');
  const handle = await open(lock, 'wx', 0o600);
  try {
    const current = await authConfig();
    if (!current?.resetAllowedUntil || current.resetAllowedUntil < Date.now()) throw new Error('The reset window has expired. Request another local reset.');
    if (password !== confirmation) throw new Error('The two passwords do not match.');
    if (verifyPassword(password, current.passwordHash)) throw new Error('Choose a different password from the previous one.');
    const config = makeAuthConfig(current.username, password);
    const file = path.join(localDir(), 'auth.json');
    await writeFile(file+'.reset', JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
    await rename(file+'.reset', file);
    return config;
  } finally { await handle.close(); await unlink(lock); }
}
export async function sessionFor(config: AuthConfig) {
  return getIronSession<{ username?: string }>(await cookies(), { password: config.sessionSecret,
    cookieName: 'contract_search_session', ttl: 8 * 60 * 60,
    cookieOptions: { httpOnly: true, sameSite: 'strict', secure: Boolean(process.env.VERCEL), path: '/' } });
}
export async function isLoggedIn(config: AuthConfig | null) {
  return Boolean(config && !config.resetAllowedUntil && (await sessionFor(config)).username === config.username);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || new URL(origin).host !== host || !['http:', 'https:'].includes(new URL(origin).protocol)) throw new Error('Request origin rejected');
}
export async function checkLogin(request: Request, config: AuthConfig, username: unknown, password: unknown) {
  const ip = process.env.VERCEL ? request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown' : 'local';
  const key = 'security/login-' + createHmac('sha256', config.sessionSecret).update(ip).digest('hex').slice(0,32) + '.json';
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readJson(key, { count: 0, until: 0 });
    const now = Date.now();
    const count = row.value.until > now ? row.value.count : 0;
    if (count >= 10) return { success: false, limited: true };
    try { await writeJson(key, { count: count + 1, until: row.value.until > now ? row.value.until : now + 15 * 60 * 1000 }, row.version); break; }
    catch (error) { if (!(error instanceof ConflictError) || attempt === 2) throw error; }
  }
  const typed = Buffer.from(typeof username === 'string' ? username : '');
  const expected = Buffer.from(config.username);
  const passwordOK = verifyPassword(password, config.passwordHash);
  const success = typed.length === expected.length && timingSafeEqual(typed, expected) && passwordOK;
  if (success) await writeJson(key, { count: 0, until: 0 });
  return { success, limited: false };
}
