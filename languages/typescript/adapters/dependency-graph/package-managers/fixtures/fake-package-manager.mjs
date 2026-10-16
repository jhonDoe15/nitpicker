import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [manager, ...args] = process.argv.slice(2);
const environment = Object.fromEntries(
  ['COREPACK_ENABLE_DOWNLOAD_PROMPT', 'YARN_ENABLE_SCRIPTS', 'YARN_NODE_LINKER'].map((name) => [
    name,
    process.env[name] ?? null,
  ]),
);
writeFileSync('fake-install-call.json', JSON.stringify({ manager, args, environment }));
mkdirSync('node_modules/fake-dependency', { recursive: true });
if (existsSync('fake-failure.txt')) {
  process.stderr.write(readFileSync('fake-failure.txt', 'utf8'));
  process.exit(1);
}
if (existsSync('fake-members.txt')) {
  for (const member of readFileSync('fake-members.txt', 'utf8').split('\n').filter(Boolean)) {
    mkdirSync(path.join(member, 'node_modules/fake-dependency'), { recursive: true });
  }
}
