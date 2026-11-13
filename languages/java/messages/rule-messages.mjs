import { readFileSync } from 'node:fs';
import { hasExceptionRoute } from '../../../shared/messages/exception-sentence.mjs';
import { definedField } from '../../../shared/messages/messages.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mjs';
import { lazy } from '../../../shared/rules/finding-helpers.mjs';
import { SOURCE_RULE_IDS } from '../adapters/kotlin/rules/kotlin-rules.mjs';

export const CATALOG_TOOLS = ['pmd', 'checkstyle', 'spotbugs'];
const catalogs = lazy(() => new Map(CATALOG_TOOLS.map((tool) => [tool, readCatalog(tool)])));
const ROUTED = new Set([
  ...CATALOG_TOOLS,
  'javac',
  'forbiddenapis',
  'duplicates',
  'coupling/package-cycle',
  'coupling/test-only-export',
  'detekt',
  'dependencies',
  'spring',
]);
const CHECKSTYLE_CHECK =
  /^com\.puppycrawl\.tools\.checkstyle\.checks\.(?:\w+\.)*(\w+?)(?:Check)?(?:#(\w+))?$/u;
const SENTENCE_END = /[.!?;:]$/u;
const EXCLUDE_ROUTE = /to "exclude" in nitpicker\.config\.json\.$/u;
const FIRST_SENTENCE = /^.*?[.!?](?= |$)/u;
const leadingFormRules = lazy(
  () =>
    new Map([
      ...rulesetNames('spring-ruleset.xml').map((name) => [name, (sentence) => sentence]),
      ...rulesetNames('spring-test-ruleset.xml').map((name) => [
        name,
        (sentence) => FIRST_SENTENCE.exec(sentence)?.[0] ?? sentence,
      ]),
    ]),
);

export function readCatalog(tool) {
  return JSON.parse(readFileSync(new URL(`./${tool}.json`, import.meta.url), 'utf8'));
}

function rulesetNames(file) {
  const text = readFileSync(new URL(`../gradle/${file}`, import.meta.url), 'utf8');
  return [...text.matchAll(/<rule name="([A-Za-z]+)"/gu)].map(([, name]) => name);
}

export function checkstyleRuleName(source) {
  const match = CHECKSTYLE_CHECK.exec(source);
  return match === null ? source : (match[2] ?? match[1]);
}

function layoutFix(javaStyle) {
  if (javaStyle === 'none') {
    return 'Fix this layout by hand; no Java formatter runs.';
  }
  const formatter = JAVA_FORMATTER_TOOLS[javaStyle]?.label ?? 'your Java formatter';
  return `Run nitpicker --fix or ${formatter} on the file; either fixes this layout. ${NOT_YOUR_JAVA_FORMATTER}`;
}

export function withRuleMessage(finding, { preset = 'java', javaStyle } = {}) {
  if (!(ROUTED.has(finding.tool) || ROUTED.has(`${finding.tool}/${finding.rule}`))) {
    return finding;
  }
  const catalog = catalogs().get(finding.tool) ?? {};
  const rule = finding.tool === 'checkstyle' ? checkstyleRuleName(finding.rule) : finding.rule;
  const entry = Object.hasOwn(catalog, rule) ? catalog[rule] : undefined;
  const exceptionRule = exceptionRuleFor({ ...finding, rule }, preset);
  const liftable =
    exceptionRule !== undefined &&
    finding.classification === 'enforceable' &&
    entry?.mayBeIntended !== false;
  return {
    ...finding,
    rule,
    ...ruleMessage({ ...finding, rule }, entry, { liftable, javaStyle, exceptionRule }),
  };
}

function exceptionRuleFor(finding, preset) {
  const qualified = `${finding.tool}/${finding.rule}`;
  if (preset === 'kotlin') {
    if (finding.tool === 'detekt' && SOURCE_RULE_IDS.includes(finding.rule)) {
      return finding.rule;
    }
    const javaSource = finding.path.endsWith('.java') && finding.tool !== 'detekt';
    return javaSource || qualified === 'coupling/test-only-export' ? qualified : undefined;
  }
  return preset === 'java' && finding.tool !== 'detekt' ? qualified : undefined;
}

export function applyRuleMessages(findings, options) {
  return findings.map((finding) => withRuleMessage(finding, options));
}

function ruleMessage(finding, entry, { liftable, javaStyle, exceptionRule }) {
  const message = finding.message.trim();
  if (hasExceptionRoute(message) || EXCLUDE_ROUTE.test(message)) {
    return { message };
  }
  const fix = entry?.layout === true ? layoutFix(javaStyle) : entry?.fix;
  if (!(catalogs().has(finding.tool) || liftable)) {
    return { message: finding.message };
  }
  const sentence = SENTENCE_END.test(message) ? message : `${message}.`;
  return {
    message: [
      sentence,
      ...(typeof fix === 'string' ? [fix] : []),
      ...(liftable ? [exceptionHint(exceptionRule, finding.path)] : []),
    ].join(' '),
    ...definedField('allowedForm', typeof fix === 'string' ? fix : leadingForm(finding, sentence)),
  };
}

function leadingForm({ tool, rule }, sentence) {
  return tool === 'pmd' ? leadingFormRules().get(rule)?.(sentence) : undefined;
}
