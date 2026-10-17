import { PYTHON_RULES_IDS, RULES_TOOL } from './rule-hints.mjs';

const SCRIPT_RULES = new Set(PYTHON_RULES_IDS);
const RUFF_RULES = new Set([
  'BLE001',
  'ERA001',
  'PLR2004',
  'PLW0602',
  'PLW0603',
  'S102',
  'S307',
  'S602',
  'S604',
  'S605',
  'T201',
  'T203',
]);

export function isPythonTouchedRule(rule, finding) {
  if (finding?.tool === RULES_TOOL) {
    return SCRIPT_RULES.has(rule);
  }
  return finding?.tool === 'ruff' && RUFF_RULES.has(rule);
}
