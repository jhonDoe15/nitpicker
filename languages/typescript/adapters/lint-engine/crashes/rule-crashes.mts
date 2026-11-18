import path from 'node:path';
import type { Finding } from '../../../../../shared/values/findings.mts';
import type { CollectedRun } from '../../oxlint/oxlint-process.mts';

export type RuleCrash = { readonly file: string; readonly rule: string; readonly error: string };

const ESLINT_CRASH_STATUS = 2;
export const MAX_SKIPPED_FILES = 5;
const CRASH =
  /(?<error>[^\r\n]*)\r?\nOccurred while linting (?<file>[^\n]+?)(?::\d+)?\r?\nRule: "(?<rule>[^"\n]+)"/u;
const GLOB_CHARACTERS = /[\\*?[\]{}()!+@]/gu;
export const RULE_CRASHED = 'rule-crashed';

export function nextRuleCrash(
  result: CollectedRun,
  projectRoot: string,
  skipped: readonly RuleCrash[],
): RuleCrash | undefined {
  if (result.status !== ESLINT_CRASH_STATUS || skipped.length >= MAX_SKIPPED_FILES) {
    return undefined;
  }
  const groups = CRASH.exec(result.stderr)?.groups;
  if (groups?.['file'] === undefined || groups['rule'] === undefined) {
    return undefined;
  }
  const file = path.relative(projectRoot, groups['file']).replaceAll('\\', '/');
  const outside = /^\.\.(?:\/|$)/u.test(file) || path.isAbsolute(file) || file.length === 0;
  if (outside || skipped.some((crash) => crash.file === file)) {
    return undefined;
  }
  return { file, rule: groups['rule'], error: (groups['error'] ?? '').trim() };
}

export function skippedFileArguments(skipped: readonly RuleCrash[]): string[] {
  if (skipped.length === 0) {
    return [];
  }
  return [
    '--no-warn-ignored',
    ...skipped.flatMap(({ file }) => [
      '--ignore-pattern',
      file.replaceAll(GLOB_CHARACTERS, String.raw`\$&`),
    ]),
  ];
}

export function ruleCrashNotes(crashes: readonly RuleCrash[], analyzerName: string): Finding[] {
  const unique = new Map(crashes.map((crash) => [`${crash.rule}\n${crash.file}`, crash]));
  return [...unique.values()].map(({ file, rule, error }) => ({
    tool: analyzerName,
    rule: RULE_CRASHED,
    path: file,
    identity: `${RULE_CRASHED}:${rule}`,
    message:
      `ESLint rule ${rule} crashed on ${file}${error.length === 0 ? '' : ` (${error})`}, ` +
      'so this file was not linted by any rule; the other files were linted. ' +
      'The crash is a bug in the rule, not a problem in this code.',
    classification: 'descriptive',
  }));
}
