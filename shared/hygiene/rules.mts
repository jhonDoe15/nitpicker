import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mts';
import { globMatcher } from '../paths/glob.mts';
import { fieldOf } from '../values/readers.mts';
import type { Finding } from '../values/findings.mts';
import type { ExceptionEntry, PathFinding } from './check-types.mts';

export function exceptionHint(rule: string, path: string, packageName?: string): string {
  const packages = packageName === undefined ? {} : { packages: [packageName] };
  return exceptionSentence(exceptionEntryText({ rule, path, ...packages }));
}

function isExceptionEntry(value: unknown): value is ExceptionEntry {
  return typeof fieldOf(value, 'rule') === 'string' && Array.isArray(fieldOf(value, 'paths'));
}

export function isExcepted(
  exceptions: readonly unknown[],
  {
    rule,
    path: filePath,
    packageName,
    symbol,
  }: {
    rule: string;
    path: string;
    packageName?: string | undefined;
    symbol?: string | undefined;
  },
): boolean {
  return exceptions
    .filter(isExceptionEntry)
    .some(
      (entry) =>
        entry.rule === rule &&
        entry.paths.some((pattern) => globMatcher(pattern).test(filePath)) &&
        (entry.packages === undefined ||
          (packageName !== undefined && entry.packages.includes(packageName))) &&
        (entry.name === undefined || entry.name === symbol),
    );
}

export function withoutExcepted(
  findings: readonly PathFinding[],
  exceptions: readonly ExceptionEntry[] = [],
): Finding[] {
  return findings
    .filter(
      (finding) =>
        !(finding.exceptionPaths ?? [finding.path]).some((findingPath) =>
          isExcepted(exceptions, { rule: finding.rule, path: findingPath }),
        ),
    )
    .map(({ exceptionPaths: _omitted, ...rest }): Finding => rest);
}

export function withoutExcluded(
  filePaths: readonly string[],
  exclude: readonly string[] = [],
): string[] {
  const patterns = exclude.map((glob) => globMatcher(glob));
  return filePaths.filter((filePath) => !patterns.some((pattern) => pattern.test(filePath)));
}
