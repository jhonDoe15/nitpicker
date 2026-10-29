import { mainMethodLines } from '../review-rules/source-declarations.mjs';

const ENTRY_POINT_RULES = new Set([
  'errorprone/SystemOut',
  'pmd/SystemPrintln',
  'pit/mutant-nocoverage',
]);
const PRINT_STACK_TRACE = /\.printStackTrace\(\s*\)/u;

export function withoutMainMethodFindings(findings, readSource) {
  const mains = new Map();
  function mainsOf(file) {
    if (!mains.has(file)) {
      const text = file.endsWith('.java') ? readSource(file) : undefined;
      mains.set(
        file,
        text === undefined ? undefined : { ranges: mainMethodLines(text), lines: text.split('\n') },
      );
    }
    return mains.get(file);
  }
  function inMain(finding) {
    const line = finding.location?.line;
    const found = line === undefined ? undefined : mainsOf(finding.path);
    if (found === undefined || !found.ranges.some(([from, to]) => line >= from && line <= to)) {
      return false;
    }
    return !(finding.rule === 'SystemOut' && PRINT_STACK_TRACE.test(found.lines[line - 1] ?? ''));
  }
  return findings.filter(
    (finding) => !ENTRY_POINT_RULES.has(`${finding.tool}/${finding.rule}`) || !inMain(finding),
  );
}
