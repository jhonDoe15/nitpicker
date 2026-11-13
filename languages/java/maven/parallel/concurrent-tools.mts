import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mjs';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';

type ToolRun = (options: Readonly<Record<string, unknown>>) => void;
type ToolTask = {
  readonly run: ToolRun;
  readonly url: string;
  readonly name: string;
  readonly options: Readonly<Record<string, unknown>>;
};
type RunMode = { readonly spawn?: unknown; readonly concurrent: boolean };

const SUPERVISOR_URL = textOf(
  checkoutModuleUrl(new URL('tool-supervisor.mjs', import.meta.url)).href,
);
const SUPERVISOR_SOURCE = [
  `import { superviseTools } from ${JSON.stringify(SUPERVISOR_URL)};`,
  'const chunks = [];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  "const outcomes = await superviseTools(JSON.parse(Buffer.concat(chunks).toString('utf8')));",
  'process.stdout.write(JSON.stringify(outcomes));',
].join('\n');
const MAX_OUTCOME_BYTES = 16 * 1024 * 1024;

function runInProcesses(tasks: readonly ToolTask[]): readonly unknown[] {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', SUPERVISOR_SOURCE], {
    input: JSON.stringify({
      tasks: tasks.map(({ url, name, options }) => ({ url, name, options })),
      limit: Math.max(1, availableParallelism()),
    }),
    encoding: 'utf8',
    maxBuffer: MAX_OUTCOME_BYTES,
    timeout: TOOL_RUN_CEILING_MS,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`The Java tool supervisor failed: ${result.stderr.trim()}`);
  }
  const outcomes: unknown = JSON.parse(result.stdout);
  return listOf(outcomes);
}

export function runToolsConcurrently(
  tasks: readonly ToolTask[],
  { spawn, concurrent }: RunMode,
): void {
  if (!concurrent || spawn !== undefined) {
    for (const task of tasks) {
      task.run({ ...task.options, spawn });
    }
    return;
  }
  const failure = runInProcesses(tasks)
    .map((outcome) => fieldOf(outcome, 'error'))
    .find((error) => error !== undefined);
  if (failure !== undefined) {
    throw new Error(textOf(fieldOf(failure, 'message')));
  }
}
