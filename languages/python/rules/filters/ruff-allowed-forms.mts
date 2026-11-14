import { isSupportSecurityFinding } from './test-support.mts';
import type {
  FormContext,
  FormFinding,
  FormOptions,
  KeepsOwner,
  LineOf,
  OwningSite,
} from './typed/allowed-form-types.mts';

const ALLOWED_NUMBERS = new Set([-1, 0, 1, 2, 10, 100, 1000]);
const MAGIC_VALUE_RULE = 'PLR2004';
const MAGIC_VALUE = /replacing `([^`]+)` with a constant/;
const SHELL_RULES = new Set(['S602', 'S604', 'S605']);
const FIXED_COMMAND = 'seems safe, but may be changed in the future';
const TEST_FILE_NOISE = /^(?:ARG|DTZ|PLR2004|S\d|ASYNC251)/u;
const COMMENT_LABEL = /^\s*#+\s*(?:[A-Z][A-Za-z]*(?: [A-Za-z]+){0,2}:\s+\S|e\.g\.|i\.e\.)/u;
const COMMENTED_CODE_RULE = 'ERA001';
const CALENDAR_PARSE_RULE = 'DTZ007';
const CALENDAR_PARSE = /strptime\(.*\)\s*\.(?:date|time)\(\s*\)/u;
const SAME_LINE_OVERLAPS: Readonly<Record<string, RegExp>> = {
  LOG015: /^G010$/u,
  ASYNC230: /^PTH/u,
  ASYNC240: /^PTH/u,
  PLE0115: /^PLW060[23]$/u,
  RET501: /^PLR1711$/u,
};

function isAllowedNumber(message: string): boolean {
  const text = MAGIC_VALUE.exec(message)?.[1];
  return text !== undefined && ALLOWED_NUMBERS.has(Number(text.replaceAll('_', '')));
}

function isLabelComment({ rule, path, location }: FormFinding, lineOf: LineOf): boolean {
  if (rule !== COMMENTED_CODE_RULE || location?.line === undefined) {
    return false;
  }
  return COMMENT_LABEL.test(lineOf(path ?? '', location.line) ?? '');
}

function isCalendarParse({ rule, path, location }: FormFinding, lineOf: LineOf): boolean {
  if (rule !== CALENDAR_PARSE_RULE || location?.line === undefined) {
    return false;
  }
  return CALENDAR_PARSE.test(lineOf(path ?? '', location.line) ?? '');
}

function siteKey({
  rule,
  path,
  line,
}: {
  rule: string;
  path: string | undefined;
  line: number;
}): string {
  return `${rule}\0${path ?? ''}\0${String(line)}`;
}

function owningSites(findings: readonly FormFinding[], keepsOwner: KeepsOwner): OwningSite[] {
  return findings.flatMap(({ tool, rule, path, location }) => {
    const owned = SAME_LINE_OVERLAPS[rule];
    const site = { owner: rule, path: path ?? '', line: location?.line };
    return tool === 'ruff' &&
      owned !== undefined &&
      site.line !== undefined &&
      keepsOwner({ ...site, line: site.line })
      ? [{ ...site, line: site.line, owned }]
      : [];
  });
}

function isOwnedOnItsLine(
  { rule, path, location }: FormFinding,
  owners: readonly OwningSite[],
): boolean {
  return owners.some(
    (owner) =>
      owner.owner !== rule &&
      owner.path === path &&
      owner.line === location?.line &&
      owner.owned.test(rule),
  );
}

function isAllowedSite({ rule, path, location }: FormFinding, sites: ReadonlySet<string>): boolean {
  return location?.line !== undefined && sites.has(siteKey({ rule, path, line: location.line }));
}

function isAllowedForm(
  finding: FormFinding,
  { testFiles, supportFiles, sites, owners, lineOf }: FormContext,
): boolean {
  const { rule, message = '', path = '' } = finding;
  if (testFiles.has(path) && TEST_FILE_NOISE.test(rule)) {
    return true;
  }
  if (isSupportSecurityFinding(finding, supportFiles) || isAllowedSite(finding, sites)) {
    return true;
  }
  if (isOwnedOnItsLine(finding, owners)) {
    return true;
  }
  if (isLabelComment(finding, lineOf) || isCalendarParse(finding, lineOf)) {
    return true;
  }
  if (rule === MAGIC_VALUE_RULE) {
    return isAllowedNumber(message);
  }
  return SHELL_RULES.has(rule) && message.includes(FIXED_COMMAND);
}

export function withoutAllowedForms<T extends FormFinding>(
  findings: readonly T[],
  {
    testFiles = [],
    supportFiles = [],
    allowed = [],
    lineOf = () => undefined,
    keepsOwner = Boolean,
  }: FormOptions = {},
): T[] {
  const context: FormContext = {
    testFiles: new Set(testFiles),
    supportFiles: new Set(supportFiles),
    sites: new Set(allowed.filter((site) => keepsOwner(site)).map(siteKey)),
    owners: owningSites(findings, keepsOwner),
    lineOf,
  };
  return findings.filter((finding) => finding.tool !== 'ruff' || !isAllowedForm(finding, context));
}
