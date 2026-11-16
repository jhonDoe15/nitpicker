import type {
  FileCoverage,
  FunctionDescriptor,
  FunctionEntry,
  MethodCoverage,
  Span,
} from '../crap-types.mts';
import { computeMethodCoverage, unavailableMethodCoverage } from './metrics.mts';
import {
  MAX_COLUMN,
  spanContains,
  spanContainsPosition,
  spansEqual,
  spansOverlap,
  spansShareBoundaryLines,
} from './spans.mts';

type Method = Pick<
  FunctionDescriptor,
  'bodySpan' | 'startLine' | 'functionName' | 'expectsStatementCoverage' | 'expectsBranchCoverage'
>;

type Outcome = FunctionEntry | typeof AMBIGUOUS | undefined;

type Attributable = { readonly span: Span; readonly fnMapConflict: boolean };

type Unit = { readonly span: Span };

const AMBIGUOUS = Symbol('ambiguous');

function normalizedForFnMap(span: Span): Span {
  return span.endLine <= span.startLine
    ? span
    : {
        startLine: span.startLine,
        startColumn: span.startColumn,
        endLine: span.endLine - 1,
        endColumn: MAX_COLUMN,
      };
}

function uniqueOutcome(matches: readonly FunctionEntry[]): Outcome {
  if (matches.length === 1) {
    return matches[0];
  }
  return matches.length > 1 ? AMBIGUOUS : undefined;
}

function matchByCandidateSpans(methodSpan: Span, functions: readonly FunctionEntry[]): Outcome {
  const normalized = normalizedForFnMap(methodSpan);
  const candidates = spansEqual(methodSpan, normalized) ? [methodSpan] : [methodSpan, normalized];
  for (const candidate of candidates) {
    const exact = uniqueOutcome(functions.filter((entry) => spansEqual(entry.span, candidate)));
    if (exact !== undefined) {
      return exact;
    }
    const aligned = uniqueOutcome(
      functions.filter(
        (entry) =>
          spansShareBoundaryLines(entry.span, candidate) && spansOverlap(entry.span, candidate),
      ),
    );
    if (aligned !== undefined) {
      return aligned;
    }
  }
  return undefined;
}

function matchByContainingSpan(methodSpan: Span, functions: readonly FunctionEntry[]): Outcome {
  const normalized = normalizedForFnMap(methodSpan);
  return uniqueOutcome(functions.filter((entry) => spanContains(entry.span, normalized)));
}

function declaresMethod(entry: FunctionEntry, method: Method): boolean {
  const declarationLine = entry.declarationStart?.line ?? entry.span.startLine;
  return (
    declarationLine === method.startLine &&
    (!entry.name || entry.name.startsWith('(') || entry.name === method.functionName)
  );
}

function matchByDeclaration(method: Method, functions: readonly FunctionEntry[]): Outcome {
  return uniqueOutcome(functions.filter((entry) => declaresMethod(entry, method)));
}

function matchFunctionCoverage(method: Method, functions: readonly FunctionEntry[]): Outcome {
  const strategies = [
    () => matchByCandidateSpans(method.bodySpan, functions),
    () => matchByContainingSpan(method.bodySpan, functions),
    () => matchByDeclaration(method, functions),
  ];
  for (const strategy of strategies) {
    const outcome = strategy();
    if (outcome !== undefined) {
      return outcome;
    }
  }
  return undefined;
}

function attributableMethods(
  methods: readonly Method[],
  functions: readonly FunctionEntry[],
): Attributable[] {
  if (functions.length === 0) {
    return methods.map((method) => ({ span: method.bodySpan, fnMapConflict: false }));
  }
  return methods.map((method) => {
    const matched = matchFunctionCoverage(method, functions);
    const span = matched === AMBIGUOUS ? undefined : matched?.span;
    return { span: span ?? method.bodySpan, fnMapConflict: matched === AMBIGUOUS };
  });
}

function isCandidate(method: Attributable, span: Span): boolean {
  return (
    !method.fnMapConflict &&
    (spanContains(method.span, span) ||
      spanContainsPosition(method.span, span.startLine, span.startColumn))
  );
}

function innermost(
  best: { readonly method: Attributable; readonly index: number } | undefined,
  current: { readonly method: Attributable; readonly index: number },
) {
  return best === undefined || spanContains(best.method.span, current.method.span) ? current : best;
}

function owningMethodIndex(methods: readonly Attributable[], span: Span): number | undefined {
  return methods
    .map((method, index) => ({ method, index }))
    .filter(({ method }) => isCandidate(method, span))
    .reduce(innermost, undefined)?.index;
}

function attributeUnits<T extends Unit>(
  methods: readonly Attributable[],
  units: readonly T[],
): T[][] {
  const owned: T[][] = methods.map(() => []);
  for (const unit of units) {
    const owner = owningMethodIndex(methods, unit.span);
    if (owner !== undefined) {
      owned[owner]?.push(unit);
    }
  }
  return owned;
}

export function coverageForMethods(
  methods: readonly Method[],
  fileCoverage: FileCoverage | undefined,
  fileUnknownReason: string | undefined,
): MethodCoverage[] {
  if (!fileCoverage) {
    return methods.map((method) => unavailableMethodCoverage(method, fileUnknownReason));
  }
  const attributable = attributableMethods(methods, fileCoverage.functions);
  const statements = attributeUnits(attributable, fileCoverage.statements);
  const branches = attributeUnits(attributable, fileCoverage.branches);
  return methods.map((method, index) =>
    attributable[index]?.fnMapConflict
      ? unavailableMethodCoverage(method, 'fnmap_conflict')
      : computeMethodCoverage(method, statements[index] ?? [], branches[index] ?? []),
  );
}
