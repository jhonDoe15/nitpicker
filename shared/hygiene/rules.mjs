import { exceptionEntryText, exceptionSentence } from '../messages/exception-sentence.mjs';
import { globMatcher } from '../paths/glob.mjs';

export function exceptionHint(rule, path, packageName) {
  const packages = packageName === undefined ? {} : { packages: [packageName] };
  return exceptionSentence(exceptionEntryText({ rule, path, ...packages }));
}

export function isExcepted(exceptions, { rule, path: filePath, packageName, symbol }) {
  return exceptions.some(
    (entry) =>
      entry.rule === rule &&
      entry.paths.some((pattern) => globMatcher(pattern).test(filePath)) &&
      (entry.packages === undefined || entry.packages.includes(packageName)) &&
      (entry.name === undefined || entry.name === symbol),
  );
}

export function withoutExcepted(findings, exceptions = []) {
  return findings
    .filter(
      (finding) =>
        !(finding.exceptionPaths ?? [finding.path]).some((findingPath) =>
          isExcepted(exceptions, { rule: finding.rule, path: findingPath }),
        ),
    )
    .map((finding) =>
      Object.fromEntries(Object.entries(finding).filter(([key]) => key !== 'exceptionPaths')),
    );
}

export function withoutExcluded(filePaths, exclude = []) {
  const patterns = exclude.map((glob) => globMatcher(glob));
  return filePaths.filter((filePath) => !patterns.some((pattern) => pattern.test(filePath)));
}
