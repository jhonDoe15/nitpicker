import type { Finding } from '../../static-checks/shared.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { evaluateBaselineExpansions as untypedBaselineExpansions } from '../../../../../shared/rules/baseline-expansion.mjs';
import { evaluateCoupling as untypedCoupling } from '../../../preset/coupling/evaluate-coupling.mjs';
import { evaluateTestRuntime as untypedTestRuntime } from '../../../../../shared/rules/test-runtime/evaluate.mjs';
import { evaluateStructure as untypedStructure } from '../../../../../shared/rules/structure.mjs';

const evaluateBaselineExpansions: (
  baseSites: readonly unknown[],
  headSites: readonly unknown[],
  analyzerName: string,
) => Finding[] = untypedBaselineExpansions;
const evaluateCoupling: (
  report: unknown,
  analyzerName: string,
  exceptions: unknown[],
) => Finding[] = untypedCoupling;
const evaluateTestRuntime: (report: unknown, analyzerName: string) => Finding[] =
  untypedTestRuntime;
const evaluateStructure: (
  report: unknown,
  analyzerName: string,
  options: { readonly hints: Readonly<Record<string, string>> },
) => Finding[] = untypedStructure;

const STRUCTURE_HINTS = {
  lines:
    'Nested functions count: move inner functions to module level, passing what they close over as one object.',
};

export function normalizeCoupling(
  report: unknown,
  analyzerName: string,
  exceptions: unknown[],
): Finding[] {
  return evaluateCoupling(
    {
      ...fieldsOf(report),
      modules: entriesOf(report, 'modules')?.map(({ source, ...metrics }) => ({
        file: source,
        ...metrics,
      })),
    },
    analyzerName,
    exceptions,
  );
}

export function normalizeStructure(report: unknown, analyzerName: string): Finding[] {
  return evaluateStructure(
    {
      ...fieldsOf(report),
      functions: entriesOf(report, 'functions')?.map(({ source, function: name, ...metrics }) => ({
        file: source,
        name,
        numberedAmongSameSource: true,
        ...metrics,
      })),
      classes: entriesOf(report, 'classes')?.map(({ source, class: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
    },
    analyzerName,
    { hints: STRUCTURE_HINTS },
  );
}

function entriesOf(report: unknown, key: string): Readonly<Record<string, unknown>>[] | undefined {
  const entries = fieldOf(report, key);
  return Array.isArray(entries) ? entries.map(fieldsOf) : undefined;
}

export {
  evaluateBaselineExpansions as normalizeBaselineExpansions,
  evaluateTestRuntime as normalizeTestRuntime,
};
