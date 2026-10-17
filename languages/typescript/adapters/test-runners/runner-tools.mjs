import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { RUNNER_PACKAGES } from '../../preset/test-runner/runners.mjs';

export function runnerInstallation(runner, liveProjectRoot) {
  const packageName = RUNNER_PACKAGES[runner];
  if (packageName === undefined) {
    return { installed: true };
  }
  try {
    resolveTool(packageName, { projectRoot: liveProjectRoot });
    return { installed: true };
  } catch (error) {
    return { installed: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
