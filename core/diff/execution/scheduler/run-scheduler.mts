import type { StdioOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withSharedBuildDirectory } from '../../../tooling/build-once/build-once.mts';
import { spawnSyncParsingOutput } from '../../../tooling/output-file/output-file.mts';
import { headPolicyEnvironment } from '../../../../shared/head-policy.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mts';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mts';
import { MAX_ANALYZER_STDOUT_BYTES } from '../../../../shared/report-output/fit-findings.mts';
import type { RunTaskOptions } from '../progress.mts';
import { solverAnswersOnce } from './solver-answers.mts';
import { textOf } from '../../../../shared/values/readers.mts';

const inSharedBuild: <T>(operation: (environment: NodeJS.ProcessEnv) => T) => T =
  withSharedBuildDirectory;
const solverAnswers = solverAnswersOnce();

const SCHEDULER_OUTPUT_OVERHEAD_BYTES = 1024 * 1024;

const SCHEDULER_GRACE_MS = 60 * 1000;

const TASK_STOP_GRACE_MS = 5 * 1000;

const schedulerPath = fileURLToPath(
  checkoutModuleUrl(new URL('../analyzer-scheduler.mjs', import.meta.url)),
);

function schedulerDeadline(tasks: readonly { readonly timeoutMs?: unknown }[]): number {
  return tasks.reduce(
    (total, task) => total + Number(task.timeoutMs) + TASK_STOP_GRACE_MS,
    SCHEDULER_GRACE_MS,
  );
}

function hasLiveStream(progress: RunTaskOptions['progress']): boolean {
  return Number.isInteger(progress?.stream.fd);
}

export function runScheduler(
  tasks: readonly object[],
  headPolicyFile: unknown,
  { progress }: Partial<RunTaskOptions> = {},
): unknown {
  const liveProgress = hasLiveStream(progress);
  const liveFd = progress?.stream.fd;
  const stdio: StdioOptions = [
    'pipe',
    'pipe',
    'pipe',
    ...(liveProgress && typeof liveFd === 'number' ? [liveFd] : []),
  ];
  const result = inSharedBuild((sharedEnvironment) =>
    spawnSyncParsingOutput(process.execPath, [schedulerPath], {
      input: JSON.stringify({
        tasks:
          liveProgress && progress !== undefined ? withProgressLabel(tasks, progress.label) : tasks,
        environment: {
          ...(headPolicyFile === undefined ? {} : headPolicyEnvironment(textOf(headPolicyFile))),
          ...sharedEnvironment,
          ...solverAnswers(),
        },
      }),
      stdio,
      encoding: 'utf8',
      maxBuffer: tasks.length * MAX_ANALYZER_STDOUT_BYTES + SCHEDULER_OUTPUT_OVERHEAD_BYTES,
      timeout: schedulerDeadline(tasks),
    }),
  );
  if (result.error !== undefined) {
    throw result.error instanceof Error ? result.error : new Error(textOf(result.error));
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'no diagnostic output';
    throw troubleshootingError(
      `Analyzer scheduler crashed with exit ${String(result.status)}: ${detail}`,
      TROUBLESHOOTING_ANCHORS.runStopped,
    );
  }
  const parsed = result.parsed ?? { error: new SyntaxError('Unexpected end of JSON input') };
  if ('value' in parsed) {
    return parsed.value;
  }
  throw troubleshootingError(
    'Analyzer scheduler returned invalid JSON',
    TROUBLESHOOTING_ANCHORS.analyzerCrashed,
    { cause: parsed.error },
  );
}

function withProgressLabel(tasks: readonly object[], label: string): object[] {
  return tasks.map((task) => ({ ...task, progress: { label } }));
}
