import {
  COMMON_EXCEPTION_RULES,
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  MESSAGES,
  NAME_EXCEPTION_RULES,
  RULE_IDS,
  RULES,
} from '../../policy.mts';
import { toolsOf as untypedToolsOf } from '../../exceptions/rule-tools.mts';
import { CO_CHANGE_ADVICE } from '../../history/co-change/findings.mts';
import { REPOSITORY_HYGIENE_TOOL } from '../../hygiene/files/repository-files.mts';
import {
  CHANGE_HISTORY_TOOL,
  PACKAGE_EXCEPTION_RULES,
  PACKAGE_RULE_IDS,
} from '../../project-rules/hygiene-rules.mts';
import { PYTHON_SIZE_RULES } from '../../project-rules/size-rules.mts';
import { UNUSED_API_RULE_IDS } from '../../unused-api/unused-api-policy.mts';
import { PRESETS, ruleEntry } from '../entry.mts';
import { DOMAIN_RULE_IDS } from '../../project-rules/domain/domain-rules.mts';
import type { LanguageColumns } from '../../project-rules/typed/rule-types.mts';
import type { AllowedForm, ExceptionRoute, RuleEntry, RuleNote } from '../typed/entry-types.mts';
import { BOUNDARY_NOTES } from './boundary-notes.mts';
import { QUALITY_NOTES } from './quality-notes.mts';
import { SIZE_NOTES } from './size-notes.mts';
import { STRUCTURE_NOTES } from './structure-notes.mts';

type CatalogRule = {
  readonly id: string;
  readonly check: string;
  readonly limit?: string | undefined;
  readonly enforcedBy: LanguageColumns;
};

const messageTemplates: Readonly<Record<string, string>> = MESSAGES;
const toolsOf: (rule: string) => readonly string[] | undefined = untypedToolsOf;
const PYTHON = 'python';
const NOTES: Readonly<Record<string, RuleNote>> = {
  ...SIZE_NOTES,
  ...QUALITY_NOTES,
  ...STRUCTURE_NOTES,
  ...BOUNDARY_NOTES,
};
const PYTHON_TOP_LEVEL = [
  ...COMMON_EXCEPTION_RULES,
  ...PYTHON_SIZE_RULES,
  UNUSED_API_RULE_IDS.unusedOption,
];
const NO_EXCEPTION = [RULE_IDS.baselineExpansion];
const OTHER_TOOLS: Readonly<Record<string, readonly string[]>> = {
  [RULE_IDS.baselineExpansion]: ['java', 'kotlin', PYTHON],
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
const JVM_COUPLING_RULES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  Object.fromEntries(
    Object.values(DOMAIN_RULE_IDS).map((id) => [
      id,
      { java: `coupling/${id}`, kotlin: `coupling/${id}` },
    ]),
  );
const NATIVE_RULES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ...JVM_COUPLING_RULES,
  [PACKAGE_RULE_IDS.unusedDependency]: {
    java: 'dependencies/unused-declared-dependency',
    kotlin: 'dependencies/unused-declared-dependency',
  },
  [RULE_IDS.docCommentContent]: {
    typescript: 'nitpicker/no-comments',
    javascript: 'nitpicker/no-comments',
  },
};

const MESSAGE_KEYS: Readonly<Record<string, readonly string[]>> = {
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
  [RULE_IDS.minifiedSourceFile]: ['minifiedSourceFile'],
};

function templateAdvice(key: string): string {
  const template = messageTemplates[key];
  if (template === undefined) {
    throw new Error(`The rule reference has no message template ${key}`);
  }
  const route = TEMPLATE_ROUTE.exec(template);
  const text = (route === null ? template : template.slice(0, route.index)).replaceAll(
    PLACEHOLDER,
    (_: string, name: string) => `<${name}>`,
  );
  const sentences = text.split(SENTENCES);
  return sentences.length > 1 && !WHOLE_MESSAGES.has(key) ? sentences.slice(1).join(' ') : text;
}

function messageAdvice(id: string): {
  readonly allowed?: string;
  readonly forms?: readonly AllowedForm[];
} {
  const keys = MESSAGE_KEYS[id];
  if (keys === undefined) {
    return id === CHANGE_HISTORY_TOOL || id === 'co-change' ? { allowed: CO_CHANGE_ADVICE } : {};
  }
  const advice = [...new Set(keys.map((key) => templateAdvice(key)))];
  const [only] = advice;
  return only !== undefined && advice.length === 1
    ? { allowed: only }
    : { forms: keys.map((key) => ({ label: key, message: templateAdvice(key) })) };
}

function analyzerOf(preset: string, check: string): string {
  if (PROJECT_ANALYZERS.has(check)) {
    return check;
  }
  if (preset === 'java' || preset === 'kotlin') {
    return preset;
  }
  if (preset === PYTHON) {
    return check === 'mutation' ? 'mutation' : PYTHON;
  }
  return check;
}

function analyzersOf(check: string, enforcedBy: LanguageColumns): Record<string, string[]> {
  const enforcing = PRESETS.filter((preset) => enforcedBy[preset] !== false);
  return Object.fromEntries(enforcing.map((preset) => [preset, [analyzerOf(preset, check)]]));
}

function exceptionOf({ id, enforcedBy }: CatalogRule): ExceptionRoute {
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
    ...(enforcedBy[PYTHON] !== false && !PYTHON_TOP_LEVEL.includes(id)
      ? { presetKeys: { python: 'python.exceptions' } }
      : {}),
    ...(NATIVE_RULES[id] === undefined ? {} : { presetRules: NATIVE_RULES[id] }),
  };
}

function findingToolsOf(id: string, check: string): string[] {
  const tools = [...(toolsOf(id) ?? []), ...(OTHER_TOOLS[id] ?? [])];
  return [...new Set(tools)].filter((tool) => tool !== check);
}

function scopeOf({ enforcedBy }: CatalogRule): string | undefined {
  if (Object.values(enforcedBy).every((value) => value === 'reported' || value === false)) {
    return REPORT_ONLY;
  }
  return enforcedBy['javascript'] === 'partial' ? PARTIAL_JAVASCRIPT : undefined;
}

function checkEntry(rule: CatalogRule): RuleEntry {
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

export function sharedCheckEntries(): RuleEntry[] {
  return RULES.map(checkEntry);
}
