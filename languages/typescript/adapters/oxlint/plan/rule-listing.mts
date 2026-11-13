import { oxlintBinary, spawnJson } from '../oxlint-process.mts';
import { PROBE_TIMEOUT_MS } from '../../../../../shared/processes/deadlines.mjs';

export function listNativeRules(env?: NodeJS.ProcessEnv): unknown {
  return spawnJson([oxlintBinary(), '--rules', '--format', 'json', import.meta.filename], {
    cwd: import.meta.dirname,
    env,
    context: 'oxlint --rules',
    timeoutMs: PROBE_TIMEOUT_MS,
  });
}
