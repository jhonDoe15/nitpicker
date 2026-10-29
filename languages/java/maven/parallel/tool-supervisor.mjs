import { spawn } from 'node:child_process';

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

function failureOf(code, output) {
  if (code === 0) {
    return {};
  }
  const text = Buffer.concat(output.stdout).toString('utf8');
  return {
    error:
      text === ''
        ? {
            message:
              Buffer.concat(output.stderr).toString('utf8').trim() || `exit code ${String(code)}`,
          }
        : JSON.parse(text),
  };
}

function runTool(task) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', TOOL_SOURCE], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [] };
    child.stdout.on('data', (chunk) => output.stdout.push(chunk));
    child.stderr.on('data', (chunk) => output.stderr.push(chunk));
    child.on('error', (error) => {
      resolve({ error: { message: error.message } });
    });
    child.on('close', (code) => {
      resolve(failureOf(code, output));
    });
    child.stdin.end(JSON.stringify(task));
  });
}

async function drain(queue, outcomes) {
  const entry = queue.shift();
  if (entry === undefined) {
    return;
  }
  outcomes[entry.index] = await runTool(entry.task);
  await drain(queue, outcomes);
}

export async function superviseTools({ tasks, limit }) {
  const queue = tasks.map((task, index) => ({ task, index }));
  const outcomes = tasks.map(() => ({}));
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => drain(queue, outcomes)),
  );
  return outcomes;
}
