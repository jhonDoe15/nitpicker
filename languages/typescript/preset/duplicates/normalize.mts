import type { Finding } from '../../adapters/static-checks/shared.mts';
import { readLayout } from '../../adapters/typed/head-policy.mts';
import {
  evaluateDuplicates,
  jscpdClones,
  renamedClones,
  renamedFindings,
  sourceRoot,
  type JscpdClone,
  withoutImportOnlyClones,
  withoutRenamedCopies,
} from './typed.mts';

const IDENTIFIER = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;
const FUNCTION_DECLARATION = String.raw`\bfunction\s*(?:\*\s*)?${IDENTIFIER}\s*[<(]`;
const FUNCTION_VALUE = String.raw`(?:async\s+)?(?:function\b|\([^()]*\)[^=;]*=>|${IDENTIFIER}\s*=>)`;
const FUNCTION_BINDING = String.raw`\b(?:const|let)\s+${IDENTIFIER}\s*=\s*${FUNCTION_VALUE}`;
const NAMED_FUNCTION = new RegExp(`${FUNCTION_DECLARATION}|${FUNCTION_BINDING}`, 'u');
const TEST_ADVICE =
  'Extract a helper, or fold the cases into one table-driven test. ' +
  'Keep one copy and call it from both places.';

function definesNamedFunction(fragment: string): boolean {
  return NAMED_FUNCTION.test(fragment);
}

function isRepeatedTestData(
  clone: JscpdClone,
  isTestFile: (file: string) => boolean,
  text: string | undefined,
): boolean {
  return (
    text !== undefined &&
    isTestFile(clone.first.file) &&
    isTestFile(clone.second.file) &&
    !definesNamedFunction(text)
  );
}

export function normalizeDuplicates(
  report: unknown,
  analyzerName: string,
  {
    configuredPaths = [sourceRoot],
    isTestFile = readLayout().isTestFile,
    renamedReport,
    projectRoot = process.cwd(),
  }: {
    readonly configuredPaths?: string[];
    readonly isTestFile?: (file: string) => boolean;
    readonly renamedReport?: unknown;
    readonly projectRoot?: string;
  } = {},
): Finding[] {
  const plain = withoutImportOnlyClones(
    jscpdClones(report, configuredPaths).filter(
      (clone) => !isRepeatedTestData(clone, isTestFile, clone.fragment),
    ),
    'typescript',
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
  ];
}
