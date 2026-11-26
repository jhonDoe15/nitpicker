import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { HYGIENE_RULE_IDS } from '../../project-rules/hygiene-rules.mts';
import { pathInside } from '../../filesystem.mts';
import { buildOutputFolders } from '../files/build-output.mts';
import { committedTooling } from '../files/known-files.mts';
import { exceptionHint } from '../rules.mts';
import type { RepositoryContext } from '../check-types.mts';
import type { Finding } from '../../values/findings.mts';

export const MINIFIED_MIN_BYTES = 20 * 1024;
export const MINIFIED_AVERAGE_LINE = 500;
export const MINIFIED_LONGEST_SHARE = 0.9;
const MAX_READ_BYTES = 16 * 1024 * 1024;
const MIN_CODE_TOKENS = 20;

const SCRIPT_FILE = /\.(?:js|mjs|cjs|ts)$/u;
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const SKIPPED_PATH =
  /(?:^|\/)(?:node_modules|vendor|third_party|test|tests|__tests__|fixtures?|__fixtures__)\/|\.(?:test|spec)\.[cm]?[jt]s$/u;
const CODE_TOKEN = /\bfunction\b|\breturn\b|=>|\bclass\b|\bnew\b/gu;

function lineShape(text: string): { count: number; longest: number } {
  let count = 0;
  let longest = 0;
  let start = 0;
  while (start <= text.length) {
    const end = text.indexOf('\n', start);
    const stop = end === -1 ? text.length : end;
    longest = Math.max(longest, Buffer.byteLength(text.slice(start, stop)));
    count += 1;
    start = stop + 1;
  }
  return { count, longest };
}

export function looksMinified(text: string): boolean {
  const bytes = Buffer.byteLength(text);
  if (bytes < MINIFIED_MIN_BYTES) {
    return false;
  }
  const { count, longest } = lineShape(text);
  const crowded = bytes / count > MINIFIED_AVERAGE_LINE || longest > bytes * MINIFIED_LONGEST_SHARE;
  return crowded && (text.match(CODE_TOKEN)?.length ?? 0) >= MIN_CODE_TOKENS;
}

function readScript(projectRoot: string, file: string): string {
  const filePath = pathInside(projectRoot, file);
  const stats = filePath === undefined ? undefined : lstatSync(filePath, { throwIfNoEntry: false });
  if (filePath === undefined || stats?.isFile() !== true) {
    return '';
  }
  return stats.size < MINIFIED_MIN_BYTES || stats.size > MAX_READ_BYTES
    ? ''
    : readFileSync(filePath, 'utf8');
}

function bundleMessage(file: string): string {
  return `${file} looks like a minified bundle inside the sources (very long lines, no formatting). Analyzers treat it as code, so it slows every run and reports findings nobody can act on. Move it out of the source root, load it as a dependency, or exclude it in the layout. ${exceptionHint(HYGIENE_RULE_IDS.committedMinifiedBundle, file)}`;
}

export function minifiedBundleFindings(
  tool: string,
  { projectRoot, files }: Pick<RepositoryContext, 'projectRoot' | 'files'>,
): Finding[] {
  const candidates = files.filter(
    (file) =>
      SCRIPT_FILE.test(file) && !DECLARATION_FILE.test(file) && !SKIPPED_PATH.test(`/${file}`),
  );
  if (candidates.length === 0) {
    return [];
  }
  const isTooling = committedTooling(projectRoot, files);
  const output = buildOutputFolders(projectRoot, files).files;
  return candidates
    .filter((file) => !(isTooling(file) || output.has(file)))
    .filter((file) => looksMinified(readScript(projectRoot, file)))
    .map((file) => ({
      tool,
      rule: HYGIENE_RULE_IDS.committedMinifiedBundle,
      path: path.posix.normalize(file),
      identity: `file:${file}|minified-bundle`,
      message: bundleMessage(file),
      classification: 'enforceable',
    }));
}
