import { pathToFileURL } from 'node:url';
import { executeGradle } from './gradle-execution.mjs';

async function readInvocation(input) {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const invocation = await readInvocation(process.stdin);
  process.stdout.write(JSON.stringify(await executeGradle(invocation)));
}
