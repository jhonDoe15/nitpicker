// Which Java findings are held to the "touched code" standard by the differential comparison
// (`touchedCode.isStrictRule` in core/diff/compare.mjs): an uncovered branch on a line this change
// touched is new even if the base already had it. Kept free of imports so any entry point can load
// it. The TypeScript check named `changed-branch-coverage` keys its identity on branch source
// instead, so it is excluded by tool.
export function isJavaTouchedRule(rule, finding) {
  return rule === 'changed-branch-coverage' && finding?.tool === 'jacoco';
}
