import { readFileSync } from 'node:fs';
import { hasExceptionRoute } from '../../../shared/messages/exception-sentence.mjs';
import { definedField } from '../../../shared/messages/messages.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';
import { JAVA_FORMATTER_TOOLS, NOT_YOUR_JAVA_FORMATTER } from '../adapters/style/java-style.mjs';

export const CATALOG_TOOLS = ['pmd', 'checkstyle', 'spotbugs'];
const CATALOGS = new Map(CATALOG_TOOLS.map((tool) => [tool, readCatalog(tool)]));
const CHECKSTYLE_CHECK =
  /^com\.puppycrawl\.tools\.checkstyle\.checks\.(?:\w+\.)*(\w+?)(?:Check)?$/u;
const SENTENCE_END = /[.!?;]$/u;
const ALLOWED_FORM_RULES = rulesetNames('spring-ruleset.xml');

export function readCatalog(tool) {
  return JSON.parse(readFileSync(new URL(`./${tool}.json`, import.meta.url), 'utf8'));
}

function rulesetNames(file) {
  const text = readFileSync(new URL(`../gradle/${file}`, import.meta.url), 'utf8');
  return new Set([...text.matchAll(/<rule name="([A-Za-z]+)"/gu)].map(([, name]) => name));
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

export function withRuleMessage(finding, { preset = 'java', javaStyle } = {}) {
  const catalog = CATALOGS.get(finding.tool);
  if (catalog === undefined) {
    return finding;
  }
  const rule = finding.tool === 'checkstyle' ? checkstyleRuleName(finding.rule) : finding.rule;
  const entry = Object.hasOwn(catalog, rule) ? catalog[rule] : undefined;
  return {
    ...finding,
    rule,
    ...ruleMessage({ ...finding, rule }, entry, { preset, javaStyle }),
  };
}

export function applyRuleMessages(findings, options) {
  return findings.map((finding) => withRuleMessage(finding, options));
}

function ruleMessage(finding, entry, { preset, javaStyle }) {
  const message = finding.message.trim();
  if (hasExceptionRoute(message)) {
    return { message };
  }
  const fix = entry?.layout === true ? layoutFix(javaStyle) : entry?.fix;
  const liftable =
    (preset === 'java' || finding.path.endsWith('.java')) &&
    finding.classification === 'enforceable' &&
    entry?.mayBeIntended !== false;
  const sentence = SENTENCE_END.test(message) ? message : `${message}.`;
  return {
    message: [
      sentence,
      ...(typeof fix === 'string' ? [fix] : []),
      ...(liftable ? [exceptionHint(`${finding.tool}/${finding.rule}`, finding.path)] : []),
    ].join(' '),
    ...definedField('allowedForm', typeof fix === 'string' ? fix : leadingForm(finding, sentence)),
  };
}

function leadingForm({ tool, rule }, sentence) {
  return tool === 'pmd' && ALLOWED_FORM_RULES.has(rule) ? sentence : undefined;
}
