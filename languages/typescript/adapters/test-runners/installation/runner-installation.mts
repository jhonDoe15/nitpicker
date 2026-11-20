import { resolveTool } from '../../../../../core/tooling/tool-resolution.mts';
import { RUNNER_PACKAGES } from '../../../preset/test-runner/runners.mts';

const packages: Readonly<Record<string, string>> = RUNNER_PACKAGES;

export function runnerInstallation(
  runner: string,
  liveProjectRoot: string,
): { installed: true } | { installed: false; reason: string } {
  const packageName = packages[runner];
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
