import { jscpdClones } from '../../../../core/tooling/jscpd-clones.mjs';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import { readLayout } from '../head-policy.mjs';
import { sourceRoot } from '../layout.mjs';

const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;
const FUNCTION_DECLARATION = String.raw`\bfunction\s*\*?\s*${IDENTIFIER}\s*[<(]`;
const FUNCTION_VALUE = String.raw`(?:async\s+)?(?:function\b|\([^()]*\)[^=;]*=>|${IDENTIFIER}\s*=>)`;
const FUNCTION_BINDING = String.raw`\b(?:const|let)\s+${IDENTIFIER}\s*=\s*${FUNCTION_VALUE}`;
const NAMED_FUNCTION = new RegExp(`${FUNCTION_DECLARATION}|${FUNCTION_BINDING}`, 'u');

function definesNamedFunction(fragment) {
  return NAMED_FUNCTION.test(fragment);
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
