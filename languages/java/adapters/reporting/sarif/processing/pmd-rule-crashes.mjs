import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const PMD_LOG = 'pmd-log.txt';
const RULE_CRASHED = 'rule-crashed';
const MAX_NAMED_FILES = 5;
const CRASH_WARNING =
  /Exception applying rule (?<rule>\S+) on file (?<file>.+?), continuing with next rule/gu;
const RULE_CRASH_CONTEXT = 'Rule applied on node';

export function isRuleCrashText(text) {
  return text.includes(RULE_CRASH_CONTEXT);
}

function relativeFile(file, projectRoot) {
  const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
    ? file.replaceAll('\\', '/')
    : relative;
}

function crashedFiles(log, projectRoot) {
  const files = new Map();
  for (const match of log.matchAll(CRASH_WARNING)) {
    const rule = match.groups?.['rule'] ?? '';
    const file = relativeFile(match.groups?.['file'] ?? '', projectRoot);
    const known = files.get(rule) ?? [];
    files.set(rule, known.includes(file) ? known : [...known, file]);
  }
  return files;
}

function fileList(files) {
  const named = files.slice(0, MAX_NAMED_FILES).map((file) => path.posix.basename(file));
  const rest = files.length - named.length;
  return `${named.join(', ')}${rest > 0 ? ` and ${String(rest)} more` : ''}`;
}

export function pmdRuleCrashNotes(log, projectRoot) {
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

function pmdLog(reportRoot) {
  const file = path.join(reportRoot, PMD_LOG);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

export function pmdLogRuleCrashes(reportRoot, projectRoot) {
  return pmdRuleCrashNotes(pmdLog(reportRoot), projectRoot);
}

export function pmdLoggedCrashFiles(reportRoot, projectRoot) {
  return new Set(
    [...pmdLog(reportRoot).matchAll(CRASH_WARNING)].map((match) =>
      path.resolve(projectRoot, match.groups?.['file'] ?? ''),
    ),
  );
}
