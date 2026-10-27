import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL) throw new Error('Password recovery must be initiated on your local computer.');
const directory = process.env.DASHBOARD_LOCAL_DIR || fileURLToPath(new URL('../.local/', import.meta.url));
const file = path.join(directory, 'auth.json');
const config = JSON.parse(await readFile(file, 'utf8'));
config.sessionSecret = randomBytes(48).toString('base64url');
config.resetAllowedUntil = Date.now() + 15 * 60 * 1000;
await writeFile(file+'.reset', JSON.stringify(config), { encoding: 'utf8', mode: 0o600 });
await rename(file+'.reset', file);
console.log('Previous login disabled. A one-time local reset is available for 15 minutes.');
console.log('Refresh http://127.0.0.1:3100 and enter the replacement password in the reset form.');
