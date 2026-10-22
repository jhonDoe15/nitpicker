import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstFileIn } from '../../../../../shared/filesystem.mjs';

export const VITEST_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'].map((extension) => `${name}.config.${extension}`),
);
const SETUP_OPTION = /\b(?:setupFiles|globalSetup)\s*:\s*(\[[^\]]*\]|(['"`])[^'"`]+\2)/gu;
const QUOTED = /(['"`])([^'"`]+)\1/gu;
const CODE_FILE = /\.[cm]?[jt]sx?$/u;

export function setupFilesIn(projectRoot) {
  const configPath = firstFileIn(projectRoot, VITEST_CONFIG_NAMES);
  if (configPath === undefined) {
    return [];
  }
  const text = readFileSync(configPath, 'utf8');
  const entries = [...text.matchAll(SETUP_OPTION)].flatMap(([, value]) =>
    [...value.matchAll(QUOTED)].map((match) => match[2]),
  );
  return [
    ...new Set(
      entries
        .filter((entry) => CODE_FILE.test(entry) && !entry.startsWith('@'))
        .map((entry) => path.posix.normalize(entry.replaceAll('\\', '/'))),
    ),
  ];
}
