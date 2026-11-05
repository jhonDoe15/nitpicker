import {
  COMMON_EXCEPTION_RULES,
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  MESSAGES,
  NAME_EXCEPTION_RULES,
  RULE_IDS,
  RULES,
} from '../../policy.mjs';
import { toolsOf } from '../../exceptions/rule-tools.mjs';
import { CO_CHANGE_ADVICE } from '../../history/co-change/findings.mjs';
import { REPOSITORY_HYGIENE_TOOL } from '../../hygiene/files/repository-files.mjs';
import {
  CHANGE_HISTORY_TOOL,
  PACKAGE_EXCEPTION_RULES,
} from '../../project-rules/hygiene-rules.mjs';
import { PYTHON_SIZE_RULES } from '../../project-rules/size-rules.mjs';
import { UNUSED_API_RULE_IDS } from '../../unused-api/unused-api-policy.mjs';
import { PRESETS, ruleEntry } from '../entry.mjs';
import { QUALITY_NOTES } from './quality-notes.mjs';
import { SIZE_NOTES } from './size-notes.mjs';
import { STRUCTURE_NOTES } from './structure-notes.mjs';

const NOTES = { ...SIZE_NOTES, ...QUALITY_NOTES, ...STRUCTURE_NOTES };
const PYTHON_TOP_LEVEL = [
  ...COMMON_EXCEPTION_RULES,
  ...PYTHON_SIZE_RULES,
  UNUSED_API_RULE_IDS.unusedOption,
];
const NO_EXCEPTION = [RULE_IDS.baselineExpansion];
const OTHER_TOOLS = {
  [RULE_IDS.baselineExpansion]: ['java', 'kotlin', 'python'],
  [RULE_IDS.testConsoleOutput]: ['test-runtime'],
};
const PROJECT_ANALYZERS = new Set([REPOSITORY_HYGIENE_TOOL, CHANGE_HISTORY_TOOL]);
const WHOLE_MESSAGES = new Set(['redefinedLibraryComponent']);
const NUMBER = /\d/u;
const PLACEHOLDER = /\{(\w+)\}/gu;
const TEMPLATE_ROUTE =
  /\s*If this is intended, add \{exception\} to "[\w.]+" in nitpicker\.config\.json\.$/u;
const SENTENCES = /(?<=[.!?])\s+(?=[A-Z])/u;
const PARTIAL_JAVASCRIPT = 'The JavaScript preset enforces this check only in part.';
const REPORT_ONLY = 'Report-only: it never fails the gate.';
const NO_EXCEPTION_NOTE =
  'It has no exception: fix the sites instead of raising the allowance of the legacy inventory.';
const NATIVE_RULES = {
  [RULE_IDS.docCommentContent]: {
    typescript: 'nitpicker/no-comments',
    javascript: 'nitpicker/no-comments',
  },
};

const MESSAGE_KEYS = {
  [RULE_IDS.functionStatements]: ['functionStatements'],
  [RULE_IDS.functionControlNesting]: ['functionControlNesting'],
  [RULE_IDS.crapScoreLimit]: ['crapScoreLimit', 'crapScoreLimitCovered'],
  [RULE_IDS.crapCoverageUnknown]: ['crapCoverageUnknown', 'crapCoverageUnknownJava'],
  [RULE_IDS.unusedProp]: ['unusedProp'],
  [RULE_IDS.unusedOption]: ['unusedOption'],
  [RULE_IDS.testOnlyExport]: [
    'testOnlyExport',
    'testOnlyReexport',
    'testOnlyModule',
    'testOnlyDeclaration',
    'testOnlyFile',
  ],
  [RULE_IDS.docCommentContent]: ['restatingDocComment', 'longDocComment'],
  [RULE_IDS.sharedUsedByOneFeature]: ['sharedUsedByOneFeature'],
  [RULE_IDS.siblingCopyEdit]: ['siblingCopyEdit'],
  [RULE_IDS.redefinedLibraryComponent]: ['redefinedLibraryComponent'],
  [RULE_IDS.newIconAsset]: ['newIconAsset'],
  [RULE_IDS.testConsoleOutput]: ['testConsoleOutput'],
  [RULE_IDS.fileLines]: ['fileLines'],
  [RULE_IDS.lineLength]: ['lineLength'],
  [RULE_IDS.folderFiles]: ['folderFiles'],
  [RULE_IDS.classMethods]: ['classMethods'],
  [RULE_IDS.classFields]: ['classFields'],
  [RULE_IDS.inheritanceDepth]: ['inheritanceDepth'],
  [RULE_IDS.componentStoryMissing]: ['componentStoryMissing', 'componentStoryMissingUnenforced'],
  [RULE_IDS.javascriptInTypescriptProject]: ['javascriptInTypescriptProject'],
};

function templateAdvice(key) {
  const text = MESSAGES[key].replace(TEMPLATE_ROUTE, '').replaceAll(PLACEHOLDER, '<$1>');
  const sentences = text.split(SENTENCES);
  return sentences.length > 1 && !WHOLE_MESSAGES.has(key) ? sentences.slice(1).join(' ') : text;
}

function messageAdvice(id) {
  const keys = MESSAGE_KEYS[id];
  if (keys === undefined) {
    return id === CHANGE_HISTORY_TOOL || id === 'co-change' ? { allowed: CO_CHANGE_ADVICE } : {};
  }
  const advice = [...new Set(keys.map((key) => templateAdvice(key)))];
  return advice.length === 1
    ? { allowed: advice[0] }
    : { forms: keys.map((key) => ({ label: key, message: templateAdvice(key) })) };
}

function analyzerOf(preset, check) {
  if (PROJECT_ANALYZERS.has(check)) {
    return check;
  }
  if (preset === 'java' || preset === 'kotlin') {
    return preset;
  }
  if (preset === 'python') {
    return check === 'mutation' ? 'mutation' : 'python';
  }
  return check;
}

function analyzersOf(check, enforcedBy) {
  const enforcing = PRESETS.filter((preset) => enforcedBy[preset] !== false);
  return Object.fromEntries(enforcing.map((preset) => [preset, [analyzerOf(preset, check)]]));
}

function exceptionOf({ id, enforcedBy }) {
  if (NO_EXCEPTION.includes(id)) {
    return { note: NO_EXCEPTION_NOTE };
  }
  return {
    key: 'exceptions',
    rule: id,
    ...(FUNCTION_EXCEPTION_RULES.includes(id) ? { function: true } : {}),
    ...(NAME_EXCEPTION_RULES.includes(id) ? { name: true } : {}),
    ...(PACKAGE_EXCEPTION_RULES.includes(id) ? { packages: true } : {}),
    ...(FUNCTION_REQUIRED_RULES.includes(id) ? { functionRequired: true } : {}),
    ...(enforcedBy.python !== false && !PYTHON_TOP_LEVEL.includes(id)
      ? { presetKeys: { python: 'python.exceptions' } }
      : {}),
    ...(NATIVE_RULES[id] === undefined ? {} : { presetRules: NATIVE_RULES[id] }),
  };
}

function findingToolsOf(id, check) {
  const tools = [...(toolsOf(id) ?? []), ...(OTHER_TOOLS[id] ?? [])];
  return [...new Set(tools)].filter((tool) => tool !== check);
}

function scopeOf({ enforcedBy }) {
  if (Object.values(enforcedBy).every((value) => value === 'reported' || value === false)) {
    return REPORT_ONLY;
  }
  return enforcedBy.javascript === 'partial' ? PARTIAL_JAVASCRIPT : undefined;
}

function checkEntry(rule) {
  const notes = NOTES[rule.id];
  if (notes === undefined) {
    throw new Error(`The rule reference has no text for the shared rule ${rule.id}`);
  }
  const [summary, why, allowed] = notes;
  const tools = findingToolsOf(rule.id, rule.check);
  const scope = scopeOf(rule);
  const advice = messageAdvice(rule.id);
  return ruleEntry({
    tool: rule.check,
    rule: rule.id,
    page: 'checks',
    ...(tools.length === 0 ? {} : { findingTools: tools }),
    analyzers: analyzersOf(rule.check, rule.enforcedBy),
    summary,
    why,
    ...(advice.allowed === undefined && advice.forms === undefined ? { allowed } : advice),
    ...(NUMBER.test(rule.limit ?? '') ? { limit: rule.limit } : {}),
    ...(scope === undefined ? {} : { scope }),
    exception: exceptionOf(rule),
    docs: [{ label: 'Checks catalog', path: 'spec/checks.md' }],
  });
}

/** The entries of the checks nitpicker runs itself, one for each rule of the shared catalog. */
export function sharedCheckEntries() {
  return RULES.map(checkEntry);
}
