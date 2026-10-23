import {
  COMMON_EXCEPTION_RULES,
  FUNCTION_EXCEPTION_RULES,
  FUNCTION_REQUIRED_RULES,
  NAME_EXCEPTION_RULES,
  RULE_IDS,
  RULES,
} from '../../policy.mjs';
import { toolsOf } from '../../exceptions/rule-tools.mjs';
import { PACKAGE_EXCEPTION_RULES } from '../../project-rules/hygiene-rules.mjs';
import { PYTHON_SIZE_RULES } from '../../project-rules/size-rules.mjs';
import { PRESETS, ruleEntry } from '../entry.mjs';
import { QUALITY_NOTES } from './quality-notes.mjs';
import { SIZE_NOTES } from './size-notes.mjs';
import { STRUCTURE_NOTES } from './structure-notes.mjs';

const NOTES = { ...SIZE_NOTES, ...QUALITY_NOTES, ...STRUCTURE_NOTES };
const PYTHON_TOP_LEVEL = [...COMMON_EXCEPTION_RULES, ...PYTHON_SIZE_RULES];
const NO_EXCEPTION = [RULE_IDS.baselineExpansion];
const OTHER_TOOLS = {
  [RULE_IDS.baselineExpansion]: ['java', 'kotlin', 'python'],
  [RULE_IDS.testConsoleOutput]: ['test-runtime'],
};
const NUMBER = /\d/u;
const PARTIAL_JAVASCRIPT = 'The JavaScript preset enforces this check only in part.';
const NO_EXCEPTION_NOTE =
  'It has no exception: fix the sites instead of raising the allowance of the legacy inventory.';

function analyzerOf(preset, check) {
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
  return Object.fromEntries(
    enforcing.map((preset) => [
      preset,
      check === 'repository-hygiene' ? [check] : [analyzerOf(preset, check)],
    ]),
  );
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
  };
}

function findingToolsOf(id, check) {
  const tools = [...(toolsOf(id) ?? []), ...(OTHER_TOOLS[id] ?? [])];
  return [...new Set(tools)].filter((tool) => tool !== check);
}

function checkEntry(rule) {
  const [summary, why, allowed] = NOTES[rule.id];
  const tools = findingToolsOf(rule.id, rule.check);
  return ruleEntry({
    tool: rule.check,
    rule: rule.id,
    page: 'checks',
    ...(tools.length === 0 ? {} : { findingTools: tools }),
    analyzers: analyzersOf(rule.check, rule.enforcedBy),
    summary,
    why,
    allowed,
    ...(NUMBER.test(rule.limit ?? '') ? { limit: rule.limit } : {}),
    ...(rule.enforcedBy.javascript === 'partial' ? { scope: PARTIAL_JAVASCRIPT } : {}),
    exception: exceptionOf(rule),
    docs: [{ label: 'Checks catalog', path: 'spec/checks.md' }],
  });
}

/** The entries of the checks nitpicker runs itself, one for each rule of the shared catalog. */
export function sharedCheckEntries() {
  return RULES.map(checkEntry);
}
