import { jscpdClones } from '../../../../core/tooling/jscpd-clones.mjs';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import { readLayout } from '../head-policy.mjs';
import { sourceRoot } from '../layout.mjs';

function definesNamedFunction(fragment) {
  return /\bfunction\s*\*?\s*[\p{L}_$][\p{L}\p{N}_$]*\s*[<(]|\b(?:const|let)\s+[\p{L}_$][\p{L}\p{N}_$]*\s*=\s*(?:async\s+)?(?:function\b|\([^()]*\)[^=;]*=>|[\p{L}_$][\p{L}\p{N}_$]*\s*=>)/u.test(
    fragment,
  );
}

function isRepeatedTestData(clone, isTestFile) {
  return (
    clone.fragment !== undefined &&
    isTestFile(clone.first.file) &&
    isTestFile(clone.second.file) &&
    !definesNamedFunction(clone.fragment)
  );
}

export function normalizeDuplicates(
  report,
  analyzerName,
  { configuredPaths = [sourceRoot], isTestFile = readLayout().isTestFile } = {},
) {
  const clones = jscpdClones(report, configuredPaths).filter(
    (clone) => !isRepeatedTestData(clone, isTestFile),
  );
  return evaluateDuplicates(clones, analyzerName);
}
