import type { StdioOptions } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withSharedBuildDirectory } from '../../../tooling/build-once/build-once.mts';
import { spawnSyncWithOutputFile } from '../../../tooling/output-file/output-file.mts';
import { headPolicyEnvironment } from '../../../../languages/typescript/preset/head-policy.mts';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import {
  TROUBLESHOOTING_ANCHORS,
  troubleshootingError,
} from '../../../../shared/messages/troubleshooting.mjs';
import { MAX_ANALYZER_STDOUT_BYTES } from '../../../../shared/report-output/fit-findings.mts';
import type { RunTaskOptions } from '../progress.mts';
import { solverAnswersOnce } from './solver-answers.mts';
import { textOf } from '../../../../shared/values/readers.mts';

const inSharedBuild: <T>(operation: (environment: NodeJS.ProcessEnv) => T) => T =
  withSharedBuildDirectory;
const policyEnvironment: (headPolicyFile: unknown) => NodeJS.ProcessEnv = headPolicyEnvironment;
const parseJson: (text: string) => unknown = JSON.parse;
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
    spawnSyncWithOutputFile(process.execPath, [schedulerPath], {
      input: JSON.stringify({
        tasks:
          liveProgress && progress !== undefined ? withProgressLabel(tasks, progress.label) : tasks,
        environment: {
          ...(headPolicyFile === undefined ? {} : policyEnvironment(headPolicyFile)),
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
  try {
    return parseJson(result.stdout);
  } catch (error) {
    throw troubleshootingError(
      'Analyzer scheduler returned invalid JSON',
      TROUBLESHOOTING_ANCHORS.analyzerCrashed,
      { cause: error },
    );
  }
}

function withProgressLabel(tasks: readonly object[], label: string): object[] {
  return tasks.map((task) => ({ ...task, progress: { label } }));
}
