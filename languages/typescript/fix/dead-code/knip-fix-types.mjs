const DEAD_CODE_TOOL = 'dead-code';

const FIX_TYPE_BY_RULE = new Map([
  ['exports', 'exports'],
  ['types', 'types'],
  ['unused-dependency', 'dependencies'],
  ['files', 'files'],
]);

const DEFAULT_FIX_TYPES = ['dependencies'];

export function knipFixTypes(selectedRules) {
  if (selectedRules.length === 0) {
    return DEFAULT_FIX_TYPES;
  }
  const selected = new Set(selectedRules);
  return [...FIX_TYPE_BY_RULE]
    .filter(([rule]) => selected.has(`${DEAD_CODE_TOOL}/${rule}`))
    .map(([, fixType]) => fixType);
}
