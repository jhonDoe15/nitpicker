import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type GradleInvocation, executeGradle } from './gradle-execution.mts';

function isInvocation(value: unknown): value is GradleInvocation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'command' in value &&
    typeof value.command === 'string' &&
    'args' in value &&
    Array.isArray(value.args) &&
    'options' in value &&
    typeof value.options === 'object' &&
    value.options !== null
  );
}

async function readInvocation(input: AsyncIterable<Buffer>): Promise<GradleInvocation> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  const invocation: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!isInvocation(invocation)) {
    throw new TypeError('The Gradle supervisor reads { command, args, options } from stdin');
  }
  return invocation;
}

async function main(input: AsyncIterable<Buffer>, output: NodeJS.WritableStream): Promise<void> {
  const invocation = await readInvocation(input);
  output.write(JSON.stringify(await executeGradle(invocation)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main(process.stdin, process.stdout);
}
