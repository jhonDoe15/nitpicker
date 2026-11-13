import { oxlintBinary, spawnJson } from '../oxlint-process.mjs';
import { PROBE_TIMEOUT_MS } from '../../../../../shared/processes/deadlines.mjs';

type JsonRequest = {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv | undefined;
  readonly context: string;
  readonly timeoutMs: number;
};

const runJson: (argumentList: readonly string[], request: JsonRequest) => unknown = spawnJson;

function binaryPath(): string {
  const binary = oxlintBinary();
  if (binary === undefined) {
    throw new TypeError('oxlint has no bin/oxlint');
  }
  return binary;
}

export function listNativeRules(env?: NodeJS.ProcessEnv): unknown {
  return runJson([binaryPath(), '--rules', '--format', 'json', import.meta.filename], {
    cwd: import.meta.dirname,
    env,
    context: 'oxlint --rules',
    timeoutMs: PROBE_TIMEOUT_MS,
  });
}
