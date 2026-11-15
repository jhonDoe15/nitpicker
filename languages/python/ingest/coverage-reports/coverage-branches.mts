import { MINIMUM_BRANCH_COVERAGE } from '../../../../shared/policy.mjs';
import { branchCoverageFindings } from '../../../../shared/rules/branch-coverage.mjs';
import { enclosingFunctionName as untypedEnclosingName } from '../../../../shared/rules/finding-helpers.mjs';
import { hashIdentity } from '../../../../shared/ingest/common.mjs';
import { formatAgnosticText as untypedFormatText } from '../../../../shared/source-text/format-tokens.mjs';
import { reportedPath } from './coverage-paths.mts';
import type { FindingsResult, IngestOptions } from '../typed/ingest-types.mts';
import { fieldOf, listOf, parseJson } from '../../../../shared/values/readers.mts';
import { isFileTable } from '../typed/coverage-types.mts';
import type { Arc, CoverageFileData } from '../typed/coverage-types.mts';

const formatAgnosticText: (text: string, path: string | undefined) => string = untypedFormatText;
const enclosingFunctionName: (
  functions: readonly unknown[],
  path: string | undefined,
  line: number,
) => string | undefined = untypedEnclosingName;

type Outcomes = {
  taken: number;
  missed: number[];
};

type FileContext = {
  readonly path: string | undefined;
  readonly lines: string[];
  readonly tool: string;
  readonly minimum: number;
  readonly options: IngestOptions;
};

const SCOPE_START = /^(?:async\s+def|def|class)\s+(\w+)/;
const CASE_START = /^case\b/;
const NO_CASE_MATCHED =
  'no case matching (if the cases cover every value, end the match with `case _:` and `assert_never(subject)`)';

export function ingestCoverageBranches(text: string, options: IngestOptions = {}): FindingsResult {
  const files = fieldOf(parseJson(text), 'files');
  if (!isFileTable(files)) {
    throw new TypeError('coverage.py JSON report must contain a files object');
  }
  const tool = options.tool ?? 'coverage-py';
  const minimum = options.minimum ?? MINIMUM_BRANCH_COVERAGE;
  const roots = options.roots ?? [undefined];
  const findings = Object.entries<CoverageFileData>(files).flatMap(([file, data]) => {
    const filePath = reportedPath(file, roots);
    const source = filePath === undefined ? undefined : options.sourceText?.(filePath);
    return source === undefined
      ? []
      : fileFindings(data, {
          path: filePath,
          lines: source.split(/\r?\n/),
          tool,
          minimum,
          options,
        });
  });
  return { findings };
}

function fileFindings(
  data: CoverageFileData,
  { path, lines, tool, minimum, options }: FileContext,
) {
  const branches = [];
  for (const [line, outcomes] of outcomesByLine(data)) {
    const source = lines[line - 1]?.trim().replaceAll(/\s+/g, ' ');
    if (source === undefined || source === '') {
      continue;
    }
    const text = formatAgnosticText(lines[line - 1] ?? '', path);
    branches.push({
      path,
      line,
      key: hashIdentity('branch-source', [enclosingScope(lines, line - 1), text]),
      anchor: hashIdentity('branch-source', [text]),
      percent: (outcomes.taken / (outcomes.taken + outcomes.missed.length)) * 100,
      arms: outcomes.missed.map((destination) => describeArm(lines, line, destination)),
      symbol: enclosingFunctionName(options.functions ?? [], path, line),
    });
  }
  return branchCoverageFindings(branches, {
    tool,
    minimum,
    identify: (key: string, occurrence: number) =>
      occurrence === 1 ? key : `${key}#${String(occurrence)}`,
  });
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function enclosingScope(lines: readonly string[], index: number): string {
  const names = [];
  let indent = indentOf(lines[index] ?? '');
  for (const earlier of lines.slice(0, index).reverse()) {
    if (indent === 0) {
      break;
    }
    const name = SCOPE_START.exec(earlier.trimStart())?.[1];
    if (name !== undefined && indentOf(earlier) < indent) {
      names.unshift(name);
      indent = indentOf(earlier);
    }
  }
  return names.join('.');
}

function outcomesByLine(data: CoverageFileData): [number, Outcomes][] {
  const byLine = new Map<number, Outcomes>();
  for (const [line] of validArcs(data.executed_branches)) {
    outcomesOf(byLine, line).taken += 1;
  }
  for (const [line, destination] of validArcs(data.missing_branches)) {
    outcomesOf(byLine, line).missed.push(destination);
  }
  return [...byLine].sort(([a], [b]) => a - b);
}

function outcomesOf(byLine: Map<number, Outcomes>, line: number): Outcomes {
  const existing = byLine.get(line);
  if (existing !== undefined) {
    return existing;
  }
  const created: Outcomes = { taken: 0, missed: [] };
  byLine.set(line, created);
  return created;
}

function isArc(arc: unknown): arc is Arc {
  return Array.isArray(arc) && Number.isInteger(arc[0]) && Number.isInteger(arc[1]);
}

function validArcs(arcs: unknown): Arc[] {
  return listOf(arcs).filter(isArc);
}

function describeArm(lines: readonly string[], line: number, destination: number): string {
  if (
    CASE_START.test((lines[line - 1] ?? '').trimStart()) &&
    leavesMatch(lines, line, destination)
  ) {
    return NO_CASE_MATCHED;
  }
  return destination > 0
    ? `the branch to line ${String(destination)}`
    : 'the exit from the enclosing scope';
}

function leavesMatch(lines: readonly string[], line: number, destination: number): boolean {
  return (
    destination < 0 || indentOf(lines[destination - 1] ?? '') < indentOf(lines[line - 1] ?? '')
  );
}
