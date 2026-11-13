import { hash } from '../typed/repository.mts';
import {
  type BranchMapEntry,
  type CoverageReport,
  type CrapEntry,
  type CrapReport,
  type FileCoverage,
  type Point,
  type Span,
  declarationLine,
  nameFreeHash,
} from '../typed/reporting.mts';
import { functionIdentity } from '../../exceptions/function-identity.mts';
import type { FunctionIdentity } from '../../exceptions/function-units.mts';
import { objectOf } from '../../../../../shared/values/readers.mts';
import type { MutantLocation, MutationReport } from '../typed/mutation.mts';

export function reportOf(value: unknown, name: string): object {
  const report = objectOf(value);
  if (report === undefined) {
    throw new TypeError(`The ${name} report is not an object`);
  }
  return report;
}
import { readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_CASE = 'the default case';
const DEFAULT_CLAUSE = /^default\b/u;
const NEVER_ANNOTATION = /^default\s*:[\s\S]*?:\s*never\b/u;
const UNION_DEFAULT_HINT =
  ' (a switch that lists every member of a union needs no default: switch-exhaustiveness-check proves it complete)';
const VALUE_DEFAULT_HINT = ' (pass a value that no case lists)';

export function withFunctionSourceHashes(parsed: unknown, projectRoot: string): CrapReport {
  const report: CrapReport = reportOf(parsed, 'function');
  const sourceTexts = new Map<string, string>();
  const identities = new Map<string, FunctionIdentity>();
  return {
    ...report,
    functions: (report.functions ?? []).map((entry): CrapEntry => {
      let source = sourceTexts.get(entry.source);
      if (source === undefined) {
        source = readProjectSource(projectRoot, entry.source);
        sourceTexts.set(entry.source, source);
        identities.set(entry.source, functionIdentity(source, entry.source));
      }
      const name = identities.get(entry.source)?.crapFunctionName(entry) ?? entry.function;
      const text = sourceLineRange(
        source,
        entry.start ?? entry.lines?.start,
        entry.end ?? entry.lines?.end,
      );
      return {
        ...entry,
        function: name,
        sourceHash: hash(text),
        ...(text === ''
          ? {}
          : { anchorHash: nameFreeHash(text, name), declarationHash: hash(declarationLine(text)) }),
      };
    }),
  };
}

export function withBranchSourceHashes(
  report: CoverageReport,
  projectRoot: string,
): CoverageReport {
  return Object.fromEntries(
    Object.entries(report).map(([absolutePath, coverage]): [string, FileCoverage] => {
      const source = readProjectSource(projectRoot, absolutePath);
      const branchSourceHashes = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          hash(
            JSON.stringify({
              type: branch.type,
              source: sourceLocation(source, branch.loc),
              outcomes: (branch.locations ?? []).map((location) =>
                sourceLocation(source, location),
              ),
            }),
          ),
        ]),
      );
      const uncoveredArms = Object.fromEntries(
        Object.entries(coverage.branchMap ?? {}).map(([branchId, branch]) => [
          branchId,
          describeUncoveredArms(branch, coverage.b?.[branchId], source),
        ]),
      );
      const branchFunctions = functionIdentity(source, absolutePath).branchFunctionNames(
        coverage.branchMap,
      );
      return [absolutePath, { ...coverage, branchSourceHashes, uncoveredArms, branchFunctions }];
    }),
  );
}

export function describeUncoveredArms(
  branch: BranchMapEntry,
  hits: readonly number[] | undefined,
  source: string,
): string[] {
  const locations = branch.locations ?? [];
  return (hits ?? []).flatMap((count, index) => {
    if (count > 0) {
      return [];
    }
    const name = armName(branch, index, source);
    const hint = name === DEFAULT_CASE ? defaultHint(branch, locations[index], source) : '';
    return [`${name} at ${armPosition(locations[index], branch)}${hint}`];
  });
}

function defaultHint(branch: BranchMapEntry, location: Span | undefined, source: string): string {
  const end = location?.end ?? branch.loc?.end;
  if (location?.start === undefined || end === undefined) {
    return VALUE_DEFAULT_HINT;
  }
  const clause = source.slice(offsetOf(source, location.start), offsetOf(source, end));
  return NEVER_ANNOTATION.test(clause) ? UNION_DEFAULT_HINT : VALUE_DEFAULT_HINT;
}

function armPosition(location: Span | undefined, branch: BranchMapEntry): string {
  const start = Number.isInteger(location?.start?.line) ? location?.start : branch.loc?.start;
  return `${String(start?.line ?? '?')}:${String((start?.column ?? 0) + 1)}`;
}

function armName(branch: BranchMapEntry, index: number, source: string): string {
  switch (branch.type ?? '') {
    case 'if':
      return index === 0 ? 'the true arm of the if' : 'the false arm of the if (or its else)';
    case 'cond-expr':
      return index === 0 ? 'the true arm of the ?:' : 'the false arm of the ?:';
    case 'binary-expr':
      return `the ${index === 0 ? 'left' : 'right'} side of ${logicalOperator(branch, source)}`;
    case 'switch':
      return startsWith(source, branch.locations?.[index], DEFAULT_CLAUSE)
        ? DEFAULT_CASE
        : 'a switch case';
    case 'default-arg':
      return 'the default value';
    default:
      return 'a branch arm';
  }
}

function logicalOperator(branch: BranchMapEntry, source: string): string {
  const [first, second] = branch.locations ?? [];
  if (first?.start === undefined || second?.start === undefined) {
    return 'the logical expression';
  }
  const between = source.slice(offsetOf(source, first.start), offsetOf(source, second.start));
  return /\?\?|&&|\|\|/u.exec(between)?.[0] ?? 'the logical expression';
}

function startsWith(source: string, location: Span | undefined, pattern: RegExp): boolean {
  return (
    location?.start !== undefined && pattern.test(source.slice(offsetOf(source, location.start)))
  );
}

function offsetOf(source: string, { line = 1, column }: Point): number {
  const precedingLines = source.split('\n').slice(0, line - 1);
  return precedingLines.reduce((total, text) => total + text.length + 1, 0) + (column ?? 0);
}

export function withMutationSourceHashes(
  report: MutationReport,
  projectRoot: string,
): MutationReport {
  return {
    ...report,
    files: Object.fromEntries(
      Object.entries(report.files ?? {}).map(([filePath, file]) => {
        const source = readProjectSource(projectRoot, filePath);
        const identity = functionIdentity(source, filePath);
        return [
          filePath,
          {
            ...file,
            mutants: (file.mutants ?? []).map((mutant) => ({
              ...mutant,
              sourceHash: hash(sourceLocation(source, mutant.location)),
              original: sourceSnippet(source, mutant.location),
              functionName: identity.functionNameAtLine(mutant.location?.start?.line),
            })),
          },
        ];
      }),
    ),
  };
}

export function readProjectSource(projectRoot: string, relativePath: string): string {
  return readFileSync(
    path.join(projectRoot, relativeProjectFile(projectRoot, relativePath)),
    'utf8',
  );
}

function relativeProjectFile(projectRoot: string, filePath: string): string {
  const absolutePath = path.resolve(projectRoot, filePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath) ||
    !lstatSync(absolutePath).isFile()
  ) {
    throw new Error(`Analyzer source path must stay within the project: ${filePath}`);
  }
  return relativePath;
}

function sourceLocation(source: string, location: Span | undefined): string {
  return sourceLineRange(source, location?.start?.line, location?.end?.line);
}

export function sourceSnippet(
  source: string,
  location: MutantLocation | undefined,
): string | undefined {
  const start = location?.start;
  const end = location?.end;
  if (
    start?.line === undefined ||
    end?.line === undefined ||
    !Number.isInteger(start.line) ||
    !Number.isInteger(end.line)
  ) {
    return undefined;
  }
  const lines = source.split(/\r?\n/);
  const startColumn = Number(start.column);
  const endColumn = Number(end.column);
  const first = lines[start.line - 1];
  const last = lines[end.line - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }
  return start.line === end.line
    ? first.slice(startColumn - 1, endColumn - 1)
    : [
        first.slice(startColumn - 1),
        ...lines.slice(start.line, end.line - 1),
        last.slice(0, endColumn - 1),
      ].join('\n');
}

function sourceLineRange(
  source: string,
  startLine: number | undefined,
  endLine: number | undefined,
): string {
  if (
    startLine === undefined ||
    endLine === undefined ||
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    endLine < startLine
  ) {
    return '';
  }
  return source
    .split(/\r?\n/)
    .slice(startLine - 1, endLine)
    .join('\n');
}
