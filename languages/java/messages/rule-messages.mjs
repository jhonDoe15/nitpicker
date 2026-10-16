import { readFileSync } from 'node:fs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';

export const CATALOG_TOOLS = ['pmd', 'checkstyle', 'spotbugs'];
export const LAYOUT_FIX = 'Run google-java-format on the file; it fixes this layout.';
const CATALOGS = new Map(CATALOG_TOOLS.map((tool) => [tool, readCatalog(tool)]));
const ROUTED_TOOLS = new Set([
  ...CATALOG_TOOLS,
  'javac',
  'forbiddenapis',
  'duplicates',
  'coupling',
  'dependencies',
  'spring',
  'pit',
]);
const CHECKSTYLE_CHECK =
  /^com\.puppycrawl\.tools\.checkstyle\.checks\.(?:\w+\.)*(\w+?)(?:Check)?$/u;
const SENTENCE_END = /[.!?;]$/u;
const CONFIG_FILE = 'nitpicker.config.json';

export function readCatalog(tool) {
  return JSON.parse(readFileSync(new URL(`./${tool}.json`, import.meta.url), 'utf8'));
}

export function checkstyleRuleName(source) {
  return CHECKSTYLE_CHECK.exec(source)?.[1] ?? source;
}

export function withRuleMessage(finding, { preset = 'java' } = {}) {
  if (!ROUTED_TOOLS.has(finding.tool)) {
    return finding;
  }
  const catalog = CATALOGS.get(finding.tool) ?? {};
  const rule = finding.tool === 'checkstyle' ? checkstyleRuleName(finding.rule) : finding.rule;
  const entry = Object.hasOwn(catalog, rule) ? catalog[rule] : undefined;
  return { ...finding, rule, message: ruleMessage({ ...finding, rule }, entry, preset) };
}

export function applyRuleMessages(findings, options) {
  return findings.map((finding) => withRuleMessage(finding, options));
}

function ruleMessage(finding, entry, preset) {
  const message = finding.message.trim();
  if (message.includes(CONFIG_FILE)) {
    return message;
  }
  const fix = entry?.layout === true ? LAYOUT_FIX : entry?.fix;
  const liftable =
    preset === 'java' && finding.classification === 'enforceable' && entry?.mayBeIntended !== false;
  if (!CATALOGS.has(finding.tool) && !liftable) {
    return finding.message;
  }
  return [
    SENTENCE_END.test(message) ? message : `${message}.`,
    ...(typeof fix === 'string' ? [fix] : []),
    ...(liftable ? [exceptionHint(`${finding.tool}/${finding.rule}`, finding.path)] : []),
  ].join(' ');
}
