import { FIX_RECIPES } from '../fix-request.mts';
import type { ComparisonCli } from './run-context.mts';

export function runnerOptions(cli: ComparisonCli): Record<string, unknown> {
  return {
    scope: cli.scope,
    progress: cli.progress,
    runTasks: cli.runTasks,
    fixRecipes: FIX_RECIPES,
    warn: (message: string) => cli.stderr.write(`nitpicker: ${message}\n`),
  };
}
