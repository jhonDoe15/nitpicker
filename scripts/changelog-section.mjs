import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HEADING = /^## \[([^\]]+)\]/u;
const LINK_DEFINITION = /^\[[^\]]+\]: /u;

export function changelogVersions(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => HEADING.exec(line)?.[1])
    .filter((version) => version !== undefined);
}

export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => HEADING.exec(line)?.[1] === version);
  if (start === -1) {
    return undefined;
  }
  const following = lines.slice(start + 1);
  const length = following.findIndex((line) => HEADING.test(line) || LINK_DEFINITION.test(line));
  return (length === -1 ? following : following.slice(0, length)).join('\n').trim();
}

function run(version) {
  const file = path.resolve(import.meta.dirname, '..', 'CHANGELOG.md');
  const section = changelogSection(readFileSync(file, 'utf8'), version);
  if (section === undefined || section === '') {
    process.stderr.write(`CHANGELOG.md has no entry for ${String(version)}\n`);
    return 1;
  }
  process.stdout.write(`${section}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = run(process.argv[2]);
}
