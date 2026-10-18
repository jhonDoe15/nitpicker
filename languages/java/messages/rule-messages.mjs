import { readFileSync } from 'node:fs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mjs';
import { SOURCE_RULE_IDS } from '../adapters/kotlin/rules/kotlin-rules.mjs';

export const CATALOG_TOOLS = ['pmd', 'checkstyle', 'spotbugs'];
const CATALOGS = new Map(CATALOG_TOOLS.map((tool) => [tool, readCatalog(tool)]));
const ERROR_PRONE_CERTAIN_BUGS = readCertainBugs();
const ROUTED = new Set([
  ...CATALOG_TOOLS,
  'errorprone',
  'javac',
  'forbiddenapis',
  'duplicates',
  'coupling/package-cycle',
  'coupling/test-only-export',
  'detekt',
  'dependencies',
  'spring',
  'pit',
]);
const CHECKSTYLE_CHECK =
  /^com\.puppycrawl\.tools\.checkstyle\.checks\.(?:\w+\.)*(\w+?)(?:Check)?$/u;
const SENTENCE_END = /[.!?;:]$/u;
const CONFIG_FILE = 'nitpicker.config.json';

export function readCatalog(tool) {
  return JSON.parse(readFileSync(new URL(`./${tool}.json`, import.meta.url), 'utf8'));
}

function readCertainBugs() {
  const checks = new URL('../gradle/errorprone/checks.json', import.meta.url);
  return new Set(JSON.parse(readFileSync(checks, 'utf8')).certainBugs);
}

export function checkstyleRuleName(source) {
  return CHECKSTYLE_CHECK.exec(source)?.[1] ?? source;
}

function layoutFix(javaStyle) {
  if (javaStyle === 'none') {
    return 'Fix this layout by hand; no Java formatter runs.';
  }
  const formatter = JAVA_FORMATTER_TOOLS[javaStyle]?.label ?? 'your Java formatter';
  return `Run ${formatter} on the file; it fixes this layout. ${NOT_YOUR_JAVA_FORMATTER}`;
}

export function withRuleMessage(finding, { preset = 'java', testRoots = [], javaStyle } = {}) {
  if (!ROUTED.has(finding.tool) && !ROUTED.has(`${finding.tool}/${finding.rule}`)) {
    return finding;
  }
  const catalog = CATALOGS.get(finding.tool) ?? {};
  const rule = finding.tool === 'checkstyle' ? checkstyleRuleName(finding.rule) : finding.rule;
  const entry = Object.hasOwn(catalog, rule) ? catalog[rule] : undefined;
  const exceptionRule = exceptionRuleFor({ ...finding, rule }, preset);
  const liftable =
    exceptionRule !== undefined &&
    finding.classification === 'enforceable' &&
    entry?.mayBeIntended !== false &&
    !isCertainBug({ ...finding, rule }, testRoots);
  return {
    ...finding,
    rule,
    message: ruleMessage({ ...finding, rule }, entry, { liftable, javaStyle, exceptionRule }),
  };
}

function exceptionRuleFor(finding, preset) {
  const qualified = `${finding.tool}/${finding.rule}`;
  if (preset === 'kotlin') {
    return finding.tool === 'detekt' && SOURCE_RULE_IDS.includes(finding.rule)
      ? finding.rule
      : qualified === 'coupling/test-only-export'
        ? qualified
        : undefined;
  }
  return preset === 'java' && finding.tool !== 'detekt' ? qualified : undefined;
}

function isCertainBug(finding, testRoots) {
  return (
    finding.tool === 'errorprone' &&
    ERROR_PRONE_CERTAIN_BUGS.has(finding.rule) &&
    !testRoots.some((root) => finding.path.startsWith(`${root}/`))
  );
}

export function applyRuleMessages(findings, options) {
  return findings.map((finding) => withRuleMessage(finding, options));
}

function ruleMessage(finding, entry, { liftable, javaStyle, exceptionRule }) {
  const message = finding.message.trim();
  if (message.includes(CONFIG_FILE)) {
    return message;
  }
  const fix = entry?.layout === true ? layoutFix(javaStyle) : entry?.fix;
  if (!CATALOGS.has(finding.tool) && !liftable) {
    return finding.message;
  }
  return [
    SENTENCE_END.test(message) ? message : `${message}.`,
    ...(typeof fix === 'string' ? [fix] : []),
    ...(liftable ? [exceptionHint(exceptionRule, finding.path)] : []),
  ].join(' ');
}
