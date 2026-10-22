import { pathToFileURL } from 'node:url';
import { executeGradle } from './gradle-execution.mjs';

async function readInvocation(input) {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function main(input, output) {
  const invocation = await readInvocation(input);
  output.write(JSON.stringify(await executeGradle(invocation)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main(process.stdin, process.stdout);
}
