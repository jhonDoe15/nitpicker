import { RULE_IDS } from '../policy.mts';
import { hash, metricFindings, occurrenceCounter, positiveInteger } from './finding-parts.mts';
import { appendAll } from '../lists/items.mjs';
import type { Finding } from '../values/findings.mts';
import { fieldOf, textOf } from '../values/readers.mts';

const MODULE_HEADER_LINE = new RegExp(
  [
    String.raw`^\s*(?:package\s+[\w.]+\s*;?`,
    String.raw`import\s+(?:static\s+)?[\w.$*]+(?:\s+as\s+\w+)?\s*;?`,
    String.raw`from\s+[\w.]+\s+import\b.*`,
    String.raw`(?:import|export)\b[^\n]*[^\w\n]from\s*['"][^'"]*['"]\s*;?`,
    String.raw`\}\s*from\s*['"][^'"]*['"]\s*;?`,
    String.raw`import\s*['"][^'"]*['"]\s*;?`,
    String.raw`import\s+[\w$]+\s*=\s*require\(\s*['"][^'"]*['"]\s*\)\s*;?`,
    String.raw`(?:(?:const|let|var)\s[^=\n]+=\s*)?(?:await\s+)?(?:require|import)\(\s*['"][^'"]*['"]\s*\)\s*;?)$`,
  ].join('|'),
  'u',
);

type Side = {
  readonly file: string;
  readonly line: unknown;
  readonly endLine: unknown;
};

type CloneInput = {
  readonly first?: unknown;
  readonly second?: unknown;
  readonly fragment?: unknown;
  readonly lines?: unknown;
  readonly tokens?: unknown;
};

type Sides = readonly [Side, Side];

function sideOf(value: unknown): Side {
  return {
    file: textOf(fieldOf(value, 'file')),
    line: fieldOf(value, 'line'),
    endLine: fieldOf(value, 'endLine'),
  };
}

function withoutModuleHeaders(fragment: string): string {
  const body = fragment
    .split('\n')
    .filter((line) => !MODULE_HEADER_LINE.test(line))
    .join('\n');
  return body.trim() === '' ? fragment : body;
}

function duplicateMessage(sides: Sides, lines: unknown): string {
  const [first, other] = sides;
  const place =
    positiveInteger(other.line) === undefined ? other.file : `${other.file}:${String(other.line)}`;
  const size = positiveInteger(lines) === undefined ? '' : ` (${String(lines)} lines)`;
  const files = first.file === other.file ? first.file : `${first.file} or ${other.file}`;
  return `This code repeats ${place}${size}. Keep one copy and call it from both places. If the repetition is intended, add ${files} to "exclude" in nitpicker.config.json.`;
}

type CloneContext = {
  readonly analyzerName: string;
  readonly sides: Sides;
  readonly clone: CloneInput;
  readonly pair: string;
  readonly occurrence: number;
};

function cloneMetrics({ analyzerName, sides, clone, pair, occurrence }: CloneContext): Finding[] {
  return ['lines', 'tokens'].flatMap((metricName) =>
    metricFindings({
      analyzerName,
      rule: 'duplicate-clone-size',
      path: sides[0].file,
      identity: `pair:${pair}:occurrence:${String(occurrence)}:${metricName}`,
      message: `Duplicate with ${sides[1].file}`,
      metricName,
      value: fieldOf(clone, metricName),
      line: sides[0].line,
    }),
  );
}

function clonedRange(
  side: Side,
  lines: number | undefined,
): { path: string; startLine: number; endLine: number } | undefined {
  const startLine = positiveInteger(side.line);
  if (startLine === undefined) {
    return undefined;
  }
  const endLine = positiveInteger(side.endLine) ?? startLine + (lines ?? 0) - 1;
  return endLine < startLine ? undefined : { path: side.file, startLine, endLine };
}

function keptLines(sides: Sides, lines: unknown): object {
  const ranges = sides.map((side) => clonedRange(side, positiveInteger(lines)));
  return ranges.includes(undefined) ? {} : { mustKeepUnchangedLines: ranges };
}

function locationOf({ line }: Side): { location?: { line: number } } {
  const lineNumber = positiveInteger(line);
  return lineNumber === undefined ? {} : { location: { line: lineNumber } };
}

function sizeRatchet(pair: string, clone: CloneInput, sides: Sides): object {
  const size = positiveInteger(clone.tokens) ?? positiveInteger(clone.lines);
  return size === undefined
    ? {}
    : {
        ratchet: {
          key: `pair:${pair}:clone`,
          value: size,
          divisible: true,
          ...keptLines(sides, clone.lines),
        },
      };
}

export function evaluateDuplicates(clones: readonly CloneInput[], analyzerName: string): Finding[] {
  const findings: Finding[] = [];
  const nextPairOccurrence = occurrenceCounter();
  const nextFragmentOccurrence = occurrenceCounter();
  for (const clone of clones) {
    const first = sideOf(clone.first);
    const second = sideOf(clone.second);
    const sides: Sides =
      first.file.localeCompare(second.file) > 0 ? [second, first] : [first, second];
    const pair = sides.map((side) => side.file).join('|');
    const pairKey = sides.map((side) => side.file).join('\0');
    const fragment = hash(withoutModuleHeaders(textOf(clone.fragment ?? '')));
    const occurrence = nextPairOccurrence(pairKey);
    const fragmentOccurrence = nextFragmentOccurrence(`${pairKey}\0${fragment}`);
    appendAll(findings, [
      {
        tool: analyzerName,
        rule: RULE_IDS.duplicateClone,
        path: sides[0].file,
        identity: `pair:${pair}:fragment:${fragment}:occurrence:${String(fragmentOccurrence)}`,
        message: duplicateMessage(sides, clone.lines),
        classification: 'enforceable',
        ...locationOf(sides[0]),
        ...sizeRatchet(pair, clone, sides),
      },
      ...cloneMetrics({ analyzerName, sides, clone, pair, occurrence }),
    ]);
  }
  return findings;
}
