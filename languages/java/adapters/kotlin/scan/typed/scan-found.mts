import {
  type Check,
  type Located,
  type Ruled,
  type Subjected,
  lineOf,
  scanKotlinSource,
} from './typed-scan.mts';

export function foundRuleLines(check: Check<Ruled>, source: string): (string | number)[][] {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [reported.rule, lineOf(scanned, reported.offset)]);
}

export function foundRuleSubjectLines(
  check: Check<Subjected>,
  source: string,
): (string | number)[][] {
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [
    reported.rule,
    lineOf(scanned, reported.offset),
    reported.subject,
  ]);
}

export function foundWrappedLines(
  check: Check<Located>,
  header: string,
  lines: string[],
): number[] {
  const source = `${header}\n${lines.map((line: string) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => lineOf(scanned, reported.offset));
}
