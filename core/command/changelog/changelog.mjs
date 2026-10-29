import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';

const HEADING = /^## \[([^\]]+)\]/u;
const LINK_DEFINITION = /^\[[^\]]+\]: /u;
const USAGE = 'Usage: nitpicker changelog [<version>]';
const HELP_FLAGS = new Set(['--help', '-h']);

export function changelogVersions(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => HEADING.exec(line)?.[1])
    .filter((version) => version !== undefined);
}

function sameVersion(heading, requested) {
  return heading.toLowerCase() === requested.replace(/^v(?=\d)/u, '').toLowerCase();
}

export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => {
    const heading = HEADING.exec(line)?.[1];
    return heading !== undefined && sameVersion(heading, version);
  });
  if (start === -1) {
    return undefined;
  }
  const following = lines.slice(start + 1);
  const length = following.findIndex((line) => HEADING.test(line) || LINK_DEFINITION.test(line));
  const body = (length === -1 ? following : following.slice(0, length)).join('\n').trim();
  return { heading: lines[start], body };
}

function installedVersion(packageRoot) {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version;
}

function missingEntry(text, version, section) {
  const problem = section === undefined ? 'has no entry' : 'has an empty entry';
  return `nitpicker: CHANGELOG.md ${problem} for ${version}. Versions: ${changelogVersions(text).join(', ')}\n`;
}

export function runChangelogCommand({
  commandArguments,
  stdout,
  stderr,
  packageRoot = PACKAGE_ROOT,
}) {
  if (commandArguments.some((argument) => HELP_FLAGS.has(argument))) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (
    commandArguments.length > 1 ||
    commandArguments.some((argument) => argument.startsWith('-'))
  ) {
    throw new Error(USAGE);
  }
  const version = commandArguments[0] ?? installedVersion(packageRoot);
  const text = readFileSync(path.join(packageRoot, 'CHANGELOG.md'), 'utf8');
  const section = changelogSection(text, version);
  if (section === undefined || section.body === '') {
    stderr.write(missingEntry(text, version, section));
    return 2;
  }
  stdout.write(`${section.heading}\n\n${section.body}\n`);
  return 0;
}
