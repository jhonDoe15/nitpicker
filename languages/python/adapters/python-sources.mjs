import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sourceLines } from '../../java/adapters/java-structure.mjs';

const SOURCE_LISTING = 'python-files.txt';
const SKIPPED_DIRECTORIES = new Set(['__pycache__', 'node_modules', 'site-packages']);

const isPythonFile = (entry) => entry.isFile() && entry.name.endsWith('.py');
const isSearched = (entry) =>
  entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name);

function collect(projectRoot, directory, found) {
  const absolute = path.join(projectRoot, directory);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
    return;
  }
  const entries = readdirSync(absolute, { withFileTypes: true });
  for (const entry of entries.filter(isPythonFile)) {
    found.add(path.posix.join(directory, entry.name));
  }
  for (const entry of entries.filter(isSearched)) {
    collect(projectRoot, path.posix.join(directory, entry.name), found);
  }
}

export function pythonSourceFiles(projectRoot, sourceRoots) {
  const found = new Set();
  for (const root of sourceRoots) {
    collect(projectRoot, root, found);
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
