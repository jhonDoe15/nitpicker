import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceLines } from '../../java/adapters/java-structure.mjs';

const SOURCE_LISTING = 'python-files.txt';
const SKIPPED_DIRECTORIES = new Set(['__pycache__', 'node_modules', 'site-packages']);

function isPythonFile(entry) {
  return entry.isFile() && entry.name.endsWith('.py');
}

function isSearched(entry) {
  return entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name);
}

function isDirectory(absolute) {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

export function pythonSourceFiles(projectRoot, sourceRoots) {
  const found = new Set();
  const pending = [...sourceRoots];
  for (const directory of pending) {
    if (!isDirectory(path.join(projectRoot, directory))) {
      continue;
    }
    const entries = readdirSync(path.join(projectRoot, directory), { withFileTypes: true });
    for (const entry of entries.filter(isPythonFile)) {
      found.add(path.posix.join(directory, entry.name));
    }
    pending.push(
      ...entries.filter(isSearched).map((entry) => path.posix.join(directory, entry.name)),
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
