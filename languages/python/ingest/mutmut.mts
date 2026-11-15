import { addMetric, hash } from '../../../shared/rules/finding-helpers.mjs';
import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { assertNeverArmLines } from './coverage-reports/exhaustive-match.mts';
import type { FindingsResult, IngestedFinding } from './typed/ingest-types.mts';
import { isMutmutRun } from './typed/mutmut-types.mts';
import type {
  Change,
  ChangedRegion,
  DescribedMutant,
  IdentifiedMutant,
  Mutant,
  MutmutFile,
  ParsedFile,
  ParsedKey,
} from './typed/mutmut-types.mts';

export const SUPPORTED_MUTMUT = 'mutmut 3.x';

const TIMEOUT = 'Timeout';
const IGNORED = 'Ignored';
const KILLED = 'Killed';
const STATUS_BY_EXIT_CODE = new Map<number, string>([
  [0, 'Survived'],
  [1, KILLED],
  [3, KILLED],
  [5, 'NoCoverage'],
  [33, 'NoCoverage'],
  [2, IGNORED],
  [34, IGNORED],
  [37, 'CompileError'],
  [24, TIMEOUT],
  [-24, TIMEOUT],
  [36, TIMEOUT],
  [152, TIMEOUT],
  [255, TIMEOUT],
]);
const CLASS_SEPARATOR = 'ǁ';
const KEY = /^(x.+)__mutmut_(\d+)$/u;
const DEFINITION = /^(\s*)(?:async\s+)?def\s+([^\s(]+)/u;
const CLOSING_BRACKET = /^\s*[)\]}]/u;
const TOKEN_PARTS = [
  String.raw`"""[\s\S]*?"""`,
  String.raw`'''[\s\S]*?'''`,
  String.raw`"(?:\\.|[^"\\\n])*"`,
  String.raw`'(?:\\.|[^'\\\n])*'`,
  String.raw`\w+`,
  String.raw`\*\*=|\/\/=|>>=|<<=|\*\*|\/\/|==|!=`,
  String.raw`<=|>=|->|:=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>`,
  String.raw`\s+`,
  String.raw`\S`,
];
const TOKEN = new RegExp(TOKEN_PARTS.join('|'), 'gu');
const NUMBER = /^\d[\w.]*$/u;
const STRING = /^[a-z]{0,2}["']/iu;
const OPERATOR = /^[^\w\s"']+$/u;
const mutantFindingsOf: (
  mutants: IdentifiedMutant[],
  options: { tool: string },
) => IngestedFinding[] = mutantFindings;

export function ingestMutmut(data: unknown, options: { tool?: string } = {}): FindingsResult {
  if (!isMutmutRun(data)) {
    throw new TypeError('mutmut run data must contain a files array');
  }
  const tool = options.tool ?? 'mutmut';
  const parsed: ParsedFile[] = data.files.map((file) => ({ file, mutants: parsedMutants(file) }));
  rejectUnreadableKeys(parsed);
  const mutants = parsed.flatMap(({ file, mutants: fileResults }) =>
    describedMutants(file, fileResults),
  );
  const findings = mutantFindingsOf(withIdentities(mutants), { tool });
  addStatusSummaries(findings, parsed, tool);
  return { findings };
}

function rejectUnreadableKeys(parsed: ParsedFile[]): void {
  const keys = parsed.flatMap(({ file }) => Object.keys(file.exitCodes));
  if (keys.length > 0 && parsed.every(({ mutants }) => mutants.length === 0)) {
    throw new TypeError(
      `mutmut wrote ${String(keys.length)} results whose names are not in the form nitpicker reads (for example ${String(keys[0])}): this mutmut version is not supported (nitpicker reads the run data of ${SUPPORTED_MUTMUT})`,
    );
  }
}

function addStatusSummaries(findings: IngestedFinding[], parsed: ParsedFile[], tool: string): void {
  const counts = new Map<string, number>();
  for (const { mutants } of parsed) {
    for (const { status } of mutants) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }
  for (const [status, value] of counts) {
    addMetric(findings, {
      analyzerName: tool,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      metricName: status,
      value,
      symbol: undefined,
      line: undefined,
    });
  }
}

export function statusOfExitCode(exitCode: unknown): string {
  if (exitCode === null) {
    return IGNORED;
  }
  return (
    (typeof exitCode === 'number' ? STATUS_BY_EXIT_CODE.get(exitCode) : undefined) ?? 'RuntimeError'
  );
}

function parsedMutants(file: MutmutFile): Mutant[] {
  return Object.entries(file.exitCodes)
    .map(([key, exitCode]) => ({ ...parseKey(key), status: statusOfExitCode(exitCode) }))
    .filter((mutant): mutant is Mutant => mutant.mangled !== undefined);
}

function describedMutants(file: MutmutFile, mutants: readonly Mutant[]): DescribedMutant[] {
  const blocks = functionBlocks(file.mutated);
  const originalLines = file.original?.split(/\r?\n/u);
  return mutants
    .filter((mutant) => mutant.status !== KILLED)
    .sort((a, b) => a.number - b.number)
    .flatMap((mutant) => {
      const change = describeChange({ mutant, blocks, originalLines });
      return change === undefined
        ? []
        : [{ path: file.path, symbol: mutant.symbol, status: mutant.status, ...change }];
    });
}

function parseKey(key: string): ParsedKey {
  const match = KEY.exec(key.slice(key.lastIndexOf('.') + 1));
  if (match === null) {
    return {};
  }
  const symbol = symbolOf(match[1] ?? '');
  return {
    mangled: match[1] ?? '',
    number: Number(match[2]),
    symbol,
    name: symbol.slice(symbol.lastIndexOf('.') + 1),
  };
}

function symbolOf(mangled: string): string {
  if (mangled.startsWith(`x${CLASS_SEPARATOR}`)) {
    return mangled.slice(1).split(CLASS_SEPARATOR).filter(Boolean).join('.');
  }
  return mangled.slice(2);
}

export function functionBlocks(source: string): Map<string, string[]> {
  const lines = source.split(/\r?\n/u);
  const blocks = new Map<string, string[]>();
  for (const [start, line] of lines.entries()) {
    const definition = DEFINITION.exec(line);
    if (definition !== null) {
      blocks.set(definition[2] ?? '', blockLines(lines, start, (definition[1] ?? '').length));
    }
  }
  return blocks;
}

function blockLines(lines: string[], start: number, indent: number): string[] {
  const stop = lines.findIndex((line, index) => index > start && !continuesBlock(line, indent));
  const block = lines.slice(start, stop === -1 ? lines.length : stop);
  return block.slice(0, block.findLastIndex((line) => line.trim() !== '') + 1);
}

function continuesBlock(line: string, indent: number): boolean {
  return (
    line.trim() === '' ||
    CLOSING_BRACKET.test(line) ||
    line.length - line.trimStart().length > indent
  );
}

function variantLines(
  { blocks, mutant }: { blocks: Map<string, string[]>; mutant: Mutant },
  variant: string,
): string[] | undefined {
  const blockName = `${mutant.mangled}__mutmut_${variant}`;
  return blocks.get(blockName)?.map((line) => line.replaceAll(blockName, mutant.name));
}

function describeChange({
  mutant,
  blocks,
  originalLines,
}: {
  mutant: Mutant;
  blocks: Map<string, string[]>;
  originalLines: string[] | undefined;
}): Change | undefined {
  const original = variantLines({ blocks, mutant }, 'orig');
  const mutated = variantLines({ blocks, mutant }, String(mutant.number));
  const change =
    original === undefined || mutated === undefined
      ? undefined
      : changedRegion(original.join('\n'), mutated.join('\n'));
  if (original === undefined || change === undefined) {
    return { label: 'mutation' };
  }
  if (insideAssertNeverArm(original, change)) {
    return undefined;
  }
  const start = locate(originalLines, original);
  const line = start === undefined ? undefined : start + 1 + change.lineOffset;
  const text = line === undefined ? undefined : originalLines?.[line - 1]?.trim();
  return {
    original: change.original,
    replacement: change.replacement,
    label: labelOf(change),
    ...(line === undefined ? {} : { line }),
    ...(text === undefined || text === ''
      ? {}
      : { anchor: `${change.original}→${change.replacement}|${hash(text)}` }),
  };
}

function changedRegion(original: string, mutated: string): ChangedRegion | undefined {
  const before = original.match(TOKEN) ?? [];
  const after = mutated.match(TOKEN) ?? [];
  const head = commonLength(before, after);
  const tail = commonLength(before.slice(head).reverse(), after.slice(head).reverse());
  const removedText = before.slice(head, before.length - tail).join('');
  const removed = removedText.trim();
  const added = after
    .slice(head, after.length - tail)
    .join('')
    .trim();
  if (removed === '' && added === '') {
    return undefined;
  }
  const leading = removed === '' ? '' : removedText.slice(0, removedText.indexOf(removed));
  return {
    original: removed,
    replacement: added,
    lineOffset: `${before.slice(0, head).join('')}${leading}`.split('\n').length - 1,
  };
}

function insideAssertNeverArm(original: string[], change: ChangedRegion): boolean {
  const last = change.lineOffset + change.original.split('\n').length - 1;
  return assertNeverArmLines(original.join('\n')).some(
    (arm) => arm.first <= change.lineOffset && last <= arm.last,
  );
}

function commonLength(left: string[], right: string[]): number {
  const differing = left.findIndex((token, index) => token !== right[index]);
  return differing === -1 ? left.length : differing;
}

function labelOf({ original, replacement }: ChangedRegion): string {
  if (NUMBER.test(original) && NUMBER.test(replacement)) {
    return 'number';
  }
  if (STRING.test(original) || STRING.test(replacement)) {
    return 'string';
  }
  return OPERATOR.test(original) && OPERATOR.test(replacement) ? 'operator' : 'expression';
}

function locate(sourceLines: string[] | undefined, wantedLines: string[]): number | undefined {
  if (sourceLines === undefined) {
    return undefined;
  }
  const found = sourceLines.findIndex((_, index) =>
    wantedLines.every((line, offset) => sourceLines[index + offset]?.trimEnd() === line.trimEnd()),
  );
  return found === -1 ? undefined : found;
}

function withIdentities(mutants: DescribedMutant[]): IdentifiedMutant[] {
  const counts = new Map<string, number>();
  return mutants.map((mutant) => {
    const base = `${mutant.symbol}|${mutant.original ?? '?'}→${mutant.replacement ?? '?'}`;
    const group = `${mutant.status}\0${mutant.path}\0${base}`;
    const occurrence = (counts.get(group) ?? 0) + 1;
    counts.set(group, occurrence);
    return { ...mutant, identity: `${base}#${String(occurrence)}` };
  });
}
