import { globToRegExp } from '../glob.mjs';

export const HYGIENE_RULE_IDS = {
  committedEnvFile: 'committed-env-file',
  committedPrivateKey: 'committed-private-key',
  committedBinary: 'committed-binary',
  largeFile: 'large-file',
};

export const PACKAGE_RULE_IDS = {
  unusedDependency: 'unused-dependency',
  unlistedDependency: 'unlisted-dependency',
  unresolvedImport: 'unresolved-import',
};

export const HYGIENE_EXCEPTION_RULES = Object.values(HYGIENE_RULE_IDS);
export const PACKAGE_EXCEPTION_RULES = Object.values(PACKAGE_RULE_IDS);

export const LARGE_FILE_BYTES = 1024 * 1024;

export function exceptionHint(rule, glob) {
  const entry = JSON.stringify({ rule, paths: [glob], reason: '...' });
  return `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;
}

export function isExcepted(exceptions, rule, filePath) {
  return exceptions.some(
    (entry) =>
      entry.rule === rule && entry.paths.some((pattern) => globToRegExp(pattern).test(filePath)),
  );
}

export function withoutExcepted(findings, exceptions = []) {
  return findings.filter((finding) => !isExcepted(exceptions, finding.rule, finding.path));
}

export function withoutExcluded(filePaths, exclude = []) {
  const patterns = exclude.map((glob) => globToRegExp(glob));
  return filePaths.filter((filePath) => !patterns.some((pattern) => pattern.test(filePath)));
}
