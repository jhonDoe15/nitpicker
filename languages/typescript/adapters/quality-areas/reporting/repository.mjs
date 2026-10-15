import { evaluateBaselineExpansions } from '../../../../../shared/rules/baseline-expansion.mjs';
import { evaluateCoupling } from '../../../../../shared/rules/coupling.mjs';
import { evaluateTestRuntime } from '../../../../../shared/rules/test-runtime.mjs';
import { evaluateStructure } from '../../../../../shared/rules/structure.mjs';

const STRUCTURE_HINTS = {
  lines:
    'Nested functions count: move inner functions to module level, passing what they close over as one object.',
};

export function normalizeBaselineExpansions(baseSites, headSites, analyzerName) {
  return evaluateBaselineExpansions(baseSites, headSites, analyzerName);
}

export function normalizeCoupling(report, analyzerName) {
  return evaluateCoupling(
    {
      ...report,
      modules: report.modules?.map(({ source, ...metrics }) => ({ file: source, ...metrics })),
    },
    analyzerName,
  );
}

export function normalizeTestRuntime(report, analyzerName) {
  return evaluateTestRuntime(report, analyzerName);
}

export function normalizeStructure(report, analyzerName) {
  return evaluateStructure(
    {
      ...report,
      functions: report.functions?.map(({ source, function: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
      classes: report.classes?.map(({ source, class: name, ...metrics }) => ({
        file: source,
        name,
        ...metrics,
      })),
    },
    analyzerName,
    { hints: STRUCTURE_HINTS },
  );
}
