import { type ChildProcess, spawn } from 'node:child_process';
import { TOOL_RUN_CEILING_MS } from '../../../../shared/processes/deadlines.mjs';

const TOOL_SOURCE = [
  'const chunks = [];',
  'for await (const chunk of process.stdin) chunks.push(chunk);',
  "const { url, name, options } = JSON.parse(Buffer.concat(chunks).toString('utf8'));",
  'try {',
  '  (await import(url))[name](options);',
  '} catch (error) {',
  '  process.stdout.write(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));',
  '  process.exitCode = 1;',
  '}',
].join('\n');

type ToolTask = { readonly url: string; readonly name: string; readonly options: unknown };
type ToolOutcome = { readonly error?: unknown };
type ExitStatus = ChildProcess['exitCode'];
type ToolOutput = { readonly stdout: Buffer[]; readonly stderr: Buffer[] };

function failureOf(code: ExitStatus, output: ToolOutput): ToolOutcome {
  if (code === 0) {
    return {};
  }
  const text = Buffer.concat(output.stdout).toString('utf8');
  if (text !== '') {
    const error: unknown = JSON.parse(text);
    return { error };
  }
  return {
    error: {
      message: Buffer.concat(output.stderr).toString('utf8').trim() || `exit code ${String(code)}`,
    },
  };
}

function runTool(task: ToolTask): Promise<ToolOutcome> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', TOOL_SOURCE], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: TOOL_RUN_CEILING_MS,
    });
    const output: ToolOutput = { stdout: [], stderr: [] };
    child.stdout.on('data', (chunk: Buffer) => output.stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => output.stderr.push(chunk));
    child.on('error', (error) => {
      resolve({ error: { message: error.message } });
    });
    child.on('close', (code) => {
      resolve(failureOf(code, output));
    });
    child.stdin.end(JSON.stringify(task));
  });
}

async function lane(
  entries: IterableIterator<[number, ToolTask]>,
  outcomes: ToolOutcome[],
): Promise<void> {
  for (const [index, task] of entries) {
    outcomes[index] = await runTool(task);
  }
}

export async function superviseTools({
  tasks,
  limit,
}: {
  readonly tasks: readonly ToolTask[];
  readonly limit: number;
}): Promise<ToolOutcome[]> {
  const entries = tasks.entries();
  const outcomes: ToolOutcome[] = tasks.map(() => ({}));
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => lane(entries, outcomes)),
  );
  return outcomes;
}
