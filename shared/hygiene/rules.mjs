import { globToRegExp } from '../glob.mjs';

export function exceptionEntry(rule, glob, packageName) {
  const packages = packageName === undefined ? {} : { packages: [packageName] };
  return JSON.stringify({ rule, paths: [glob], ...packages, reason: '...' });
}

export function exceptionHint(rule, glob, packageName) {
  const entry = exceptionEntry(rule, glob, packageName);
  return `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;
}

export function isExcepted(exceptions, { rule, path: filePath, packageName }) {
  return exceptions.some(
    (entry) =>
      entry.rule === rule &&
      entry.paths.some((pattern) => globToRegExp(pattern).test(filePath)) &&
      (entry.packages === undefined || entry.packages.includes(packageName)),
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
  const patterns = exclude.map((glob) => globToRegExp(glob));
  return filePaths.filter((filePath) => !patterns.some((pattern) => pattern.test(filePath)));
}
