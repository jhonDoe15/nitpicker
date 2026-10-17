import { jscpdClones } from '../../../../core/tooling/jscpd-clones.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';
import { evaluateDuplicates } from '../../../../shared/rules/duplicates.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import {
  renamedClones,
  renamedFindings,
  withoutRenamedCopies,
} from '../../../../shared/renamed-clones/findings.mjs';
import { readLayout } from '../head-policy.mjs';
import { sourceRoot } from '../layout.mjs';

const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;
const FUNCTION_DECLARATION = String.raw`\bfunction\s*\*?\s*${IDENTIFIER}\s*[<(]`;
const FUNCTION_VALUE = String.raw`(?:async\s+)?(?:function\b|\([^()]*\)[^=;]*=>|${IDENTIFIER}\s*=>)`;
const FUNCTION_BINDING = String.raw`\b(?:const|let)\s+${IDENTIFIER}\s*=\s*${FUNCTION_VALUE}`;
const NAMED_FUNCTION = new RegExp(`${FUNCTION_DECLARATION}|${FUNCTION_BINDING}`, 'u');
const TEST_ADVICE =
  'Extract a helper, or fold the cases into one table-driven test. ' +
  'Keep one copy and call it from both places.';

function definesNamedFunction(fragment) {
  return NAMED_FUNCTION.test(fragment);
}

function isRepeatedTestData(clone, isTestFile, text) {
  return (
    text !== undefined &&
    isTestFile(clone.first.file) &&
    isTestFile(clone.second.file) &&
    !definesNamedFunction(text)
  );
}

function withExceptionRoute(finding) {
  return finding.rule === RULE_IDS.duplicateClone && finding.classification === 'enforceable'
    ? {
        ...finding,
        message: `${finding.message} ${exceptionHint(RULE_IDS.duplicateClone, finding.path)}`,
      }
    : finding;
}

export function normalizeDuplicates(
  report,
  analyzerName,
  {
    configuredPaths = [sourceRoot],
    isTestFile = readLayout().isTestFile,
    renamedReport,
    projectRoot = process.cwd(),
    isExcepted = () => false,
  } = {},
) {
  const plain = jscpdClones(report, configuredPaths).filter(
    (clone) => !isRepeatedTestData(clone, isTestFile, clone.fragment),
  );
  const renamed =
    renamedReport === undefined
      ? []
      : renamedClones(jscpdClones(renamedReport, []), { projectRoot, syntax: 'typescript' }).filter(
          (clone) => !isRepeatedTestData(clone, isTestFile, clone.original),
        );
  return [
    ...evaluateDuplicates(withoutRenamedCopies(plain, renamed), analyzerName),
    ...renamedFindings(renamed, analyzerName, { isTestFile, text: TEST_ADVICE }),
  ]
    .filter(
      (finding) =>
        !(
          finding.rule === RULE_IDS.duplicateClone &&
          isExcepted(RULE_IDS.duplicateClone, finding.path)
        ),
    )
    .map(withExceptionRoute);
}
