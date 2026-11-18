import {
  fieldOf,
  fieldsOf,
  listOf,
  numberOr,
  optionalText,
  textOf,
} from '../../../../shared/values/readers.mts';

type Optional<Value> = Value | undefined;

type EffectsViolation = {
  readonly rule: string;
  readonly className: string;
  readonly fileName: string;
  readonly line: number;
  readonly firstLine: number;
  readonly detail: string;
  readonly raw: unknown;
};

type CoveredFact = {
  readonly className: string;
  readonly fileName: string;
  readonly verdict: Optional<string>;
  readonly [field: string]: unknown;
};

export type LocatedFact = CoveredFact & { readonly path: string };

export type EffectsReport = {
  readonly classes: unknown;
  readonly skipped: number;
  readonly unreadableLibraries: number;
  readonly degraded: { readonly oversizedMethods: number; readonly timeBudgetExceeded: boolean };
  readonly unresolved: { readonly supertypes: number; readonly total: number };
  readonly unavailable: Optional<string>;
  readonly violations: readonly EffectsViolation[];
  readonly covered: readonly CoveredFact[];
};

function violationOf(value: unknown): EffectsViolation {
  const line = numberOr(fieldOf(value, 'line'), 0);
  return {
    rule: textOf(fieldOf(value, 'rule')),
    className: textOf(fieldOf(value, 'className')),
    fileName: textOf(fieldOf(value, 'fileName')),
    line,
    firstLine: numberOr(fieldOf(value, 'firstLine'), line),
    detail: textOf(fieldOf(value, 'detail')),
    raw: value,
  };
}

function coveredOf(value: unknown): CoveredFact {
  return {
    ...fieldsOf(value),
    className: textOf(fieldOf(value, 'className')),
    fileName: textOf(fieldOf(value, 'fileName')),
    verdict: optionalText(fieldOf(value, 'verdict')),
  };
}

export function reportOf(value: unknown): EffectsReport {
  const degraded = fieldOf(value, 'degraded');
  const unresolved = fieldOf(value, 'unresolved');
  return {
    classes: fieldOf(value, 'classes'),
    skipped: numberOr(fieldOf(value, 'skipped'), 0),
    unreadableLibraries: numberOr(fieldOf(value, 'unreadableLibraries'), 0),
    degraded: {
      oversizedMethods: numberOr(fieldOf(degraded, 'oversizedMethods'), 0),
      timeBudgetExceeded: fieldOf(degraded, 'timeBudgetExceeded') === true,
    },
    unresolved: {
      supertypes: numberOr(fieldOf(unresolved, 'supertypes'), 0),
      total: numberOr(fieldOf(unresolved, 'total'), 0),
    },
    unavailable: optionalText(fieldOf(value, 'unavailable')),
    violations: listOf(fieldOf(value, 'violations')).map(violationOf),
    covered: listOf(fieldOf(value, 'covered')).map(coveredOf),
  };
}
