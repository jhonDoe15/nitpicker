import { computeMethodCoverage, unavailableMethodCoverage } from './metrics.mjs';
import {
  MAX_COLUMN,
  spanContains,
  spanContainsPosition,
  spansEqual,
  spansOverlap,
  spansShareBoundaryLines,
} from './spans.mjs';

const AMBIGUOUS = Symbol('ambiguous');

function normalizedForFnMap(span) {
  return span.endLine <= span.startLine
    ? span
    : {
        startLine: span.startLine,
        startColumn: span.startColumn,
        endLine: span.endLine - 1,
        endColumn: MAX_COLUMN,
      };
}

function uniqueOutcome(matches) {
  if (matches.length === 1) {
    return matches[0];
  }
  return matches.length > 1 ? AMBIGUOUS : undefined;
}

function matchByCandidateSpans(methodSpan, functions) {
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

function matchByContainingSpan(methodSpan, functions) {
  const normalized = normalizedForFnMap(methodSpan);
  return uniqueOutcome(functions.filter((entry) => spanContains(entry.span, normalized)));
}

function declaresMethod(entry, method) {
  const declarationLine = entry.declarationStart?.line ?? entry.span.startLine;
  return (
    declarationLine === method.startLine &&
    (!entry.name || entry.name.startsWith('(') || entry.name === method.functionName)
  );
}

function matchByDeclaration(method, functions) {
  return uniqueOutcome(functions.filter((entry) => declaresMethod(entry, method)));
}

function matchFunctionCoverage(method, functions) {
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

function attributableMethods(methods, functions) {
  if (functions.length === 0) {
    return methods.map((method) => ({ span: method.bodySpan, fnMapConflict: false }));
  }
  return methods.map((method) => {
    const matched = matchFunctionCoverage(method, functions);
    return { span: matched?.span ?? method.bodySpan, fnMapConflict: matched === AMBIGUOUS };
  });
}

function isCandidate(method, span) {
  return (
    !method.fnMapConflict &&
    (spanContains(method.span, span) ||
      spanContainsPosition(method.span, span.startLine, span.startColumn))
  );
}

function innermost(best, current) {
  return best === undefined || spanContains(best.method.span, current.method.span) ? current : best;
}

function owningMethodIndex(methods, span) {
  return methods
    .map((method, index) => ({ method, index }))
    .filter(({ method }) => isCandidate(method, span))
    .reduce(innermost, undefined)?.index;
}

function attributeUnits(methods, units) {
  const owned = methods.map(() => []);
  for (const unit of units) {
    const owner = owningMethodIndex(methods, unit.span);
    if (owner !== undefined) {
      owned[owner].push(unit);
    }
  }
  return owned;
}

export function coverageForMethods(methods, fileCoverage, fileUnknownReason) {
  if (!fileCoverage) {
    return methods.map((method) => unavailableMethodCoverage(method, fileUnknownReason));
  }
  const attributable = attributableMethods(methods, fileCoverage.functions);
  const statements = attributeUnits(attributable, fileCoverage.statements);
  const branches = attributeUnits(attributable, fileCoverage.branches);
  return methods.map((method, index) =>
    attributable[index].fnMapConflict
      ? unavailableMethodCoverage(method, 'fnmap_conflict')
      : computeMethodCoverage(method, statements[index], branches[index]),
  );
}
