import path from 'node:path';
import { compositionRootRegExp } from '../boundaries/composition-root-files.mjs';

const ENTRY_STEMS = [
  'main',
  'server',
  'composition-root',
  'composition_root',
  'manage',
  'wsgi',
  'asgi',
  'cli',
  'app',
  'application',
  'celery',
  'bootstrap',
  'worker',
];
const ENTRY_FILE = new RegExp(`(?:^|/)(?:${ENTRY_STEMS.join('|')})\\.[cm]?[jt]sx?$`, 'u');
const DOMAIN_DIRECTORY = /(?:^|\/)domain\//u;

export const rootFileOptionsSchema = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
      entryPoints: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
];

function rootPattern(userPattern) {
  try {
    return compositionRootRegExp(userPattern);
  } catch (error) {
    throw new Error(
      `nitpicker/no-service-locator: the "compositionRootPattern" option ${JSON.stringify(userPattern)} is not a valid regular expression (${error.message}). Fix the pattern in the rule options.`,
      { cause: error },
    );
  }
}

export function rootFileMatcher(options) {
  const entryPoints = options?.entryPoints ?? [];
  const pattern = rootPattern(options?.compositionRootPattern);
  return (fileName) => {
    const normalized = fileName.replaceAll('\\', '/');
    return (
      pattern.test(normalized) ||
      (ENTRY_FILE.test(normalized) && !DOMAIN_DIRECTORY.test(normalized)) ||
      entryPoints.some((glob) => path.posix.matchesGlob(normalized, `**/${glob}`))
    );
  };
}
