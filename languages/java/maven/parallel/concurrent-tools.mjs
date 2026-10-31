import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';

const SUPERVISOR_URL = new URL('tool-supervisor.mjs', import.meta.url).href;
const SUPERVISOR_SOURCE = [
  `import { superviseTools } from ${JSON.stringify(SUPERVISOR_URL)};`,
  'const chunks = [];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  "const outcomes = await superviseTools(JSON.parse(Buffer.concat(chunks).toString('utf8')));",
  'process.stdout.write(JSON.stringify(outcomes));',
].join('\n');
const MAX_OUTCOME_BYTES = 16 * 1024 * 1024;

function runInProcesses(tasks) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', SUPERVISOR_SOURCE], {
    input: JSON.stringify({
      tasks: tasks.map(({ url, name, options }) => ({ url, name, options })),
      limit: Math.max(1, availableParallelism()),
    }),
    encoding: 'utf8',
    maxBuffer: MAX_OUTCOME_BYTES,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`The Java tool supervisor failed: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

export function runToolsConcurrently(tasks, { spawn, concurrent }) {
  if (!concurrent || spawn !== undefined) {
    for (const task of tasks) {
      task.run({ ...task.options, spawn });
    }
    return;
  }
  const failure = runInProcesses(tasks)
    .map(({ error }) => error)
    .find((error) => error !== undefined);
  if (failure !== undefined) {
    throw new Error(failure.message);
  }
}
