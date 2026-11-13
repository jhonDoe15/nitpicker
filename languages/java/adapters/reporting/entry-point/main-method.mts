import { mainMethodLines } from '../../review-rules/source-declarations.mjs';
import { callUntyped } from '../../typed/java-values.mts';
import { fieldOf, listOf, numberOr, textOf } from '../../../../../shared/values/readers.mts';

type MainMethods = { readonly ranges: readonly (readonly number[])[]; readonly lines: string[] };
type ReadSource = (file: string) => string | undefined;

const ENTRY_POINT_RULES = new Set([
  'errorprone/SystemOut',
  'pmd/SystemPrintln',
  'pit/mutant-nocoverage',
]);
const PRINT_STACK_TRACE = /\.printStackTrace\(\s*\)/u;

function mainMethodsOf(text: string): MainMethods {
  const ranges = listOf(callUntyped(mainMethodLines, text)).map((range) =>
    listOf(range).map((line) => numberOr(line, 0)),
  );
  return { ranges, lines: text.split('\n') };
}

function inRanges(found: MainMethods, line: number): boolean {
  return found.ranges.some(([from = 0, to = 0]) => line >= from && line <= to);
}

export function withoutMainMethodFindings(
  findings: readonly unknown[],
  readSource: ReadSource,
): unknown[] {
  const mains = new Map<string, MainMethods | undefined>();
  function mainsOf(file: string): MainMethods | undefined {
    if (!mains.has(file)) {
      const text = file.endsWith('.java') ? readSource(file) : undefined;
      mains.set(file, text === undefined ? undefined : mainMethodsOf(text));
    }
    return mains.get(file);
  }
  function inMain(finding: unknown): boolean {
    const line = fieldOf(fieldOf(finding, 'location'), 'line');
    const found = typeof line === 'number' ? mainsOf(textOf(fieldOf(finding, 'path'))) : undefined;
    if (typeof line !== 'number' || found === undefined || !inRanges(found, line)) {
      return false;
    }
    const printed = PRINT_STACK_TRACE.test(found.lines[line - 1] ?? '');
    return !(fieldOf(finding, 'rule') === 'SystemOut' && printed);
  }
  return findings.filter(
    (finding) =>
      !ENTRY_POINT_RULES.has(
        `${textOf(fieldOf(finding, 'tool'))}/${textOf(fieldOf(finding, 'rule'))}`,
      ) || !inMain(finding),
  );
}
