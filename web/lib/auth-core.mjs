import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function makePasswordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Use a password between 12 and 256 characters.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  return `scrypt1:${salt}:${hash}`;
}

export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 256 || typeof encoded !== 'string') return false;
  const [version, salt, expected] = encoded.split(':');
  if (version !== 'scrypt1' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(expected || '')) return false;
  const actual = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function makeAuthConfig(username, password) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
    throw new Error('Use 3–64 letters, numbers, periods, underscores, or hyphens for your username.');
  }
  return { username, passwordHash: makePasswordHash(password), sessionSecret: randomBytes(48).toString('base64url') };
}

export { safeWebUrl } from './shared.mjs';
