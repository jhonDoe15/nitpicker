import path from 'node:path';
import type { RunEslintCli } from '../../lint-engine/typed/tools.mts';
import { type LintResult, type ResidualGroup, lintResultsOf } from '../plan/oxlint-shapes.mts';

export function residualRun(
  residualRuns: Map<string, Promise<LintResult[]>>,
  residual: readonly ResidualGroup[],
  start: () => Promise<LintResult[]>,
): Promise<LintResult[]> {
  const key = JSON.stringify(residual);
  const running = residualRuns.get(key) ?? start();
  residualRuns.set(key, running);
  return running;
}

export async function residualResults(
  projectRoot: string,
  residual: readonly ResidualGroup[],
  runEslintCli: RunEslintCli,
): Promise<LintResult[]> {
  if (residual.length === 0) return [];
  const files = [...new Set(residual.flatMap((group) => group.files))].sort();
  const rules = [...new Set(residual.flatMap((group) => group.rules))].sort();
  const results = lintResultsOf(
    await runEslintCli(files, {
      NITPICKER_DIFF_ESLINT_ONLY_RULES: JSON.stringify(rules),
    }),
  );
  return results.map((result) => ({
    filePath: path.relative(projectRoot, result.filePath).replaceAll('\\', '/'),
    messages: result.messages.filter(
      (message) => message.ruleId !== undefined && rules.includes(message.ruleId),
    ),
  }));
}
