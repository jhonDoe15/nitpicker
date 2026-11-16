import path from 'node:path';
import type { JSONSchema } from '@typescript-eslint/utils';
import { compositionRootRegExp } from '../boundaries/composition-root-files.mts';

export type RootFileOptions = {
  readonly compositionRootPattern?: string;
  readonly entryPoints?: readonly string[];
};

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

export const rootFileOptionsSchema: JSONSchema.JSONSchema4[] = [
  {
    type: 'object',
    properties: {
      compositionRootPattern: { type: 'string' },
      entryPoints: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
];

function rootPattern(userPattern: string | undefined): RegExp {
  try {
    return compositionRootRegExp(userPattern);
  } catch (error) {
    throw new Error(
      `nitpicker/no-service-locator: the "compositionRootPattern" option ${JSON.stringify(userPattern)} is not a valid regular expression (${error instanceof Error ? error.message : String(error)}). Fix the pattern in the rule options.`,
      { cause: error },
    );
  }
}

export function rootFileMatcher(
  options: RootFileOptions | undefined,
): (fileName: string) => boolean {
  const entryPoints = options?.entryPoints ?? [];
  const pattern = rootPattern(options?.compositionRootPattern);
  return (fileName: string): boolean => {
    const normalized = fileName.replaceAll('\\', '/');
    return (
      pattern.test(normalized) ||
      (ENTRY_FILE.test(normalized) && !DOMAIN_DIRECTORY.test(normalized)) ||
      entryPoints.some((glob) => path.posix.matchesGlob(normalized, `**/${glob}`))
    );
  };
}
