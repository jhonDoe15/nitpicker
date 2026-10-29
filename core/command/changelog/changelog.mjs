import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { usageError } from '../../../shared/messages/troubleshooting.mjs';

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

function installedVersion(packageRoot) {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
}

export function runChangelogCommand({
  commandArguments,
  stdout,
  stderr,
  packageRoot = PACKAGE_ROOT,
}) {
  if (
    commandArguments.length > 1 ||
    commandArguments.some((argument) => argument.startsWith('-'))
  ) {
    throw usageError('Usage: nitpicker changelog [<version>]');
  }
  const version = commandArguments[0] ?? installedVersion(packageRoot);
  const text = readFileSync(path.join(packageRoot, 'CHANGELOG.md'), 'utf8');
  const section = changelogSection(text, version);
  if (section === undefined || section === '') {
    stderr.write(
      `nitpicker: CHANGELOG.md has no entry for ${version}. Versions: ${changelogVersions(text).join(', ')}\n`,
    );
    return 2;
  }
  stdout.write(`${section}\n`);
  return 0;
}
