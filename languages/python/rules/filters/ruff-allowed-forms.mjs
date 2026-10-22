import { isSupportSecurityFinding } from './test-support.mjs';

const ALLOWED_NUMBERS = new Set([-1, 0, 1, 2, 10, 100, 1000]);
const MAGIC_VALUE_RULE = 'PLR2004';
const MAGIC_VALUE = /replacing `([^`]+)` with a constant/;
const SHELL_RULES = new Set(['S602', 'S604', 'S605']);
const FIXED_COMMAND = /seems safe, but may be changed in the future/;
const TEST_FILE_NOISE = /^(?:ARG|FBT|PLR2004|S\d)/u;
const COMMENT_LABEL = /^\s*#+\s*(?:[A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}:\s+\S|e\.g\.|i\.e\.)/u;
const COMMENTED_CODE_RULE = 'ERA001';
const SAME_LINE_OVERLAPS = { LOG015: ['G010'] };

function isAllowedNumber(message) {
  const text = MAGIC_VALUE.exec(message)?.[1];
  return text !== undefined && ALLOWED_NUMBERS.has(Number(text.replaceAll('_', '')));
}

function isLabelComment({ rule, path, location }, lineOf) {
  if (rule !== COMMENTED_CODE_RULE || location?.line === undefined) {
    return false;
  }
  return COMMENT_LABEL.test(lineOf(path, location.line) ?? '');
}

function siteKey({ rule, path, line }) {
  return `${rule}\0${path}\0${String(line)}`;
}

function overlapSites(findings) {
  return findings.flatMap(({ tool, rule, path, location }) =>
    tool === 'ruff' && location?.line !== undefined
      ? (SAME_LINE_OVERLAPS[rule] ?? []).map((other) => ({
          rule: other,
          path,
          line: location.line,
        }))
      : [],
  );
}

function isAllowedSite({ rule, path, location }, sites) {
  return location?.line !== undefined && sites.has(siteKey({ rule, path, line: location.line }));
}

function isAllowedForm(finding, { testFiles, supportFiles, sites, lineOf }) {
  const { rule, message, path } = finding;
  if (testFiles.has(path) && TEST_FILE_NOISE.test(rule)) {
    return true;
  }
  if (isSupportSecurityFinding(finding, supportFiles) || isAllowedSite(finding, sites)) {
    return true;
  }
  if (isLabelComment(finding, lineOf)) {
    return true;
  }
  if (rule === MAGIC_VALUE_RULE) {
    return isAllowedNumber(message);
  }
  return SHELL_RULES.has(rule) && FIXED_COMMAND.test(message);
}

export function withoutAllowedForms(
  findings,
  { testFiles = [], supportFiles = [], allowed = [], lineOf = () => undefined } = {},
) {
  const context = {
    testFiles: new Set(testFiles),
    supportFiles: new Set(supportFiles),
    sites: new Set([...allowed, ...overlapSites(findings)].map(siteKey)),
    lineOf,
  };
  return findings.filter((finding) => finding.tool !== 'ruff' || !isAllowedForm(finding, context));
}
