import type { Placed } from '../spotbugs-placed.mts';

const WARNING = 'warning';
const LEVELS = { 1: WARNING, 2: WARNING };

export const COOKIE_PATTERNS: readonly string[] = [
  'HTTPONLY_COOKIE',
  'INSECURE_COOKIE',
  'COOKIE_PERSISTENT',
  'URL_REWRITING',
];

export const COOKIE_PLACED: Readonly<Record<string, Placed>> = {
  HTTPONLY_COOKIE: { text: 'Cookie without the HttpOnly flag', levels: LEVELS },
  INSECURE_COOKIE: { text: 'Cookie without the secure flag', levels: LEVELS },
  COOKIE_PERSISTENT: { text: 'Persistent Cookie Usage', levels: LEVELS },
  URL_REWRITING: { text: 'URL rewriting method', levels: LEVELS },
};
