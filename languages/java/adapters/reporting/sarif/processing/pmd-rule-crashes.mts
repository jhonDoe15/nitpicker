import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ENGINE_LOG } from '../../../../builds/rulesets/engine/pmd-engine.mts';

export const PMD_LOG = 'pmd-log.txt';

type CrashNote = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};
const RULE_CRASHED = 'rule-crashed';
const MAX_NAMED_FILES = 5;
const CRASH_WARNING =
  /Exception applying rule (?<rule>\S+) on file (?<file>.+?), continuing with next rule/gu;
const RULE_CRASH_CONTEXT = 'Rule applied on node';

export function isRuleCrashText(text: string): boolean {
  return text.includes(RULE_CRASH_CONTEXT);
}

function relativeFile(file: string, projectRoot: string): string {
  const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
    ? file.replaceAll('\\', '/')
    : relative;
}

function crashedFiles(log: string, projectRoot: string): Map<string, string[]> {
  const files = new Map<string, string[]>();
  for (const match of log.matchAll(CRASH_WARNING)) {
    const rule = match.groups?.['rule'] ?? '';
    const file = relativeFile(match.groups?.['file'] ?? '', projectRoot);
    const known = files.get(rule) ?? [];
    files.set(rule, known.includes(file) ? known : [...known, file]);
  }
  return files;
}

function fileList(files: readonly string[]): string {
  const named = files.slice(0, MAX_NAMED_FILES).map((file) => path.posix.basename(file));
  const rest = files.length - named.length;
  return `${named.join(', ')}${rest > 0 ? ` and ${String(rest)} more` : ''}`;
}

export function pmdRuleCrashNotes(log: string, projectRoot: string): CrashNote[] {
  return [...crashedFiles(log, projectRoot)].map(([rule, unsorted]) => {
    const files = unsorted.toSorted();
    return {
      tool: 'pmd',
      rule: RULE_CRASHED,
      path: files[0] ?? '.',
      identity: `${RULE_CRASHED}:${rule}`,
      message:
        `PMD's ${rule} crashed on ${String(files.length)} ${files.length === 1 ? 'file' : 'files'} ` +
        `and did not check ${files.length === 1 ? 'it' : 'them'}: ${fileList(files)}. ` +
        'The other rules checked these files. The crash is a bug in the rule, not a problem in this code.',
      classification: 'descriptive',
    };
  });
}

function pmdLog(reportRoot: string): string {
  return [PMD_LOG, ENGINE_LOG]
    .map((name) => path.join(reportRoot, name))
    .filter((file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

export function pmdLogRuleCrashes(reportRoot: string, projectRoot: string): CrashNote[] {
  return pmdRuleCrashNotes(pmdLog(reportRoot), projectRoot);
}

export function pmdLoggedCrashFiles(reportRoot: string, projectRoot: string): ReadonlySet<string> {
  return new Set(
    [...pmdLog(reportRoot).matchAll(CRASH_WARNING)].map((match) =>
      path.resolve(projectRoot, match.groups?.['file'] ?? ''),
    ),
  );
}
