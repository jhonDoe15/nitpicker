import { isSupportSecurityFinding } from './test-support.mjs';

const ALLOWED_NUMBERS = new Set([-1, 0, 1, 2, 10, 100, 1000]);
const MAGIC_VALUE_RULE = 'PLR2004';
const MAGIC_VALUE = /replacing `([^`]+)` with a constant/;
const SHELL_RULES = new Set(['S602', 'S604', 'S605']);
const FIXED_COMMAND = /seems safe, but may be changed in the future/;
const TEST_FILE_NOISE = /^(?:ARG|FBT|PLR2004|S\d|ASYNC251)/u;
const COMMENT_LABEL = /^\s*#+\s*(?:[A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}:\s+\S|e\.g\.|i\.e\.)/u;
const COMMENTED_CODE_RULE = 'ERA001';
const SAME_LINE_OVERLAPS = {
  LOG015: /^G010$/u,
  ASYNC230: /^PTH/u,
  ASYNC240: /^PTH/u,
  PLE0115: /^PLW060[23]$/u,
};

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

function owningSites(findings, keepsOwner) {
  return findings.flatMap(({ tool, rule, path, location }) => {
    const owned = SAME_LINE_OVERLAPS[rule];
    const site = { owner: rule, path, line: location?.line };
    return tool === 'ruff' && owned !== undefined && site.line !== undefined && keepsOwner(site)
      ? [{ ...site, owned }]
      : [];
  });
}

function isOwnedOnItsLine({ rule, path, location }, owners) {
  return owners.some(
    (owner) =>
      owner.owner !== rule &&
      owner.path === path &&
      owner.line === location?.line &&
      owner.owned.test(rule),
  );
}

function isAllowedSite({ rule, path, location }, sites) {
  return location?.line !== undefined && sites.has(siteKey({ rule, path, line: location.line }));
}

function isAllowedForm(finding, { testFiles, supportFiles, sites, owners, lineOf }) {
  const { rule, message, path } = finding;
  if (testFiles.has(path) && TEST_FILE_NOISE.test(rule)) {
    return true;
  }
  if (isSupportSecurityFinding(finding, supportFiles) || isAllowedSite(finding, sites)) {
    return true;
  }
  if (isOwnedOnItsLine(finding, owners)) {
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
  {
    testFiles = [],
    supportFiles = [],
    allowed = [],
    lineOf = () => undefined,
    keepsOwner = () => true,
  } = {},
) {
  const context = {
    testFiles: new Set(testFiles),
    supportFiles: new Set(supportFiles),
    sites: new Set(
      allowed.filter((site) => site.owner === undefined || keepsOwner(site)).map(siteKey),
    ),
    owners: owningSites(findings, keepsOwner),
    lineOf,
  };
  return findings.filter((finding) => finding.tool !== 'ruff' || !isAllowedForm(finding, context));
}
