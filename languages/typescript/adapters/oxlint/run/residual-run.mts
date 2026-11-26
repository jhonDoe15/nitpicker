import path from 'node:path';
import type { RunEslintCli } from '../../lint-engine/typed/tools.mts';
import { cachedValue } from '../../../../../shared/values/caching/cached-value.mts';
import { ENGINE_FINDINGS_FILE } from '../../../../../shared/engine/engine-findings-file.mts';
import {
  type LintResult,
  type ResidualGroup,
  lintResultsOf,
  residualPairs,
} from '../plan/oxlint-shapes.mts';

export function residualRun(
  residualRuns: Map<string, Promise<LintResult[]>>,
  residual: readonly ResidualGroup[],
  start: () => Promise<LintResult[]>,
): Promise<LintResult[]> {
  return cachedValue(residualRuns, JSON.stringify(residual), start);
}

export async function residualResults(
  projectRoot: string,
  residual: readonly ResidualGroup[],
  {
    runEslintCli,
    replay,
  }: { readonly runEslintCli: RunEslintCli; readonly replay: string | undefined },
): Promise<LintResult[]> {
  if (residual.length === 0) {
    return [];
  }
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  const pairs = residualPairs(residual);
  const listed = new Set(files);
  const results = lintResultsOf(
    await runEslintCli(files, {
      NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules),
      ...(replay === undefined ? {} : { [ENGINE_FINDINGS_FILE]: replay }),
    }),
  );
  return results.map((result) => {
    const filePath = path.relative(projectRoot, result.filePath).replaceAll('\\', '/');
    return {
      filePath,
      messages: result.messages.filter(
        (message) =>
          message.ruleId !== undefined &&
          rules.includes(message.ruleId) &&
          (!listed.has(filePath) || pairs.has(JSON.stringify([filePath, message.ruleId]))),
      ),
    };
  });
}
