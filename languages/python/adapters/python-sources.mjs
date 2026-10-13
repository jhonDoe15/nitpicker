import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceLines } from '../../java/adapters/java-structure.mjs';
import {
  INSTALLED_DIRECTORIES,
  NON_SOURCE_DIRECTORIES,
  NON_SOURCE_FILES,
} from './python-project.mjs';

const SOURCE_LISTING = 'python-files.txt';
const WHOLE_PROJECT = '.';
const INSTALLED = new Set(INSTALLED_DIRECTORIES);

function isPythonFile(entry, { wholeProject }) {
  return (
    entry.isFile() &&
    entry.name.endsWith('.py') &&
    !(wholeProject && NON_SOURCE_FILES.has(entry.name))
  );
}

function isSearched(entry, { wholeProject }) {
  const skipped = wholeProject ? NON_SOURCE_DIRECTORIES : INSTALLED;
  return entry.isDirectory() && !entry.name.startsWith('.') && !skipped.has(entry.name);
}

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

export function pythonSourceFiles(projectRoot, sourceRoots) {
  const found = new Set();
  const pending = sourceRoots.map((directory) => ({
    directory,
    wholeProject: directory === WHOLE_PROJECT,
  }));
  for (const { directory, wholeProject } of pending) {
    if (!isDirectory(path.join(projectRoot, directory))) {
      continue;
    }
    const entries = readdirSync(path.join(projectRoot, directory), { withFileTypes: true });
    for (const entry of entries.filter((candidate) => isPythonFile(candidate, { wholeProject }))) {
      found.add(path.posix.join(directory, entry.name));
    }
    pending.push(
      ...entries
        .filter((candidate) => isSearched(candidate, { wholeProject }))
        .map((entry) => ({ directory: path.posix.join(directory, entry.name), wholeProject })),
    );
  }
  return [...found].sort();
}

export function writeSourceListing({ projectRoot, reportRoot, project }) {
  const files = pythonSourceFiles(projectRoot, project.sourceRoots);
  const listing = path.join(reportRoot, SOURCE_LISTING);
  writeFileSync(listing, files.join('\n'));
  return { files, listing };
}

export function functionText(sources, projectRoot, { file, start, end }) {
  const lines = sourceLines(sources, projectRoot, file)
    .slice(start - 1, end)
    .map((line) => line.trimEnd());
  const indent = Math.min(
    ...lines.filter((line) => line !== '').map((line) => /^\s*/.exec(line)[0].length),
  );
  return lines.map((line) => line.slice(indent)).join('\n');
}
