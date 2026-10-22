import { readFileSync, writeFileSync } from 'node:fs';
import { readBaseFiles } from '../changes.mjs';
import { containedPath } from './contained-path.mjs';

function namesOf(files) {
  return files.map(({ path: name }) => name);
}

function cleanAtBase(existing, baseSources, format) {
  const bases = new Map(namesOf(existing).map((name) => [name, baseSources.get(name)]));
  const { formatted } = format(bases);
  return new Set(namesOf(existing).filter((name) => formatted.get(name) === bases.get(name)));
}

export function rewriteFormatted({ projectRoot, repositoryRoot, mergeBaseSha, files, format }) {
  const live = new Map(
    namesOf(files).map((name) => [name, readFileSync(containedPath(projectRoot, name), 'utf8')]),
  );
  const first = format(live);
  const differing = files.filter(({ path: name }) => {
    const formatted = first.formatted.get(name);
    return formatted !== undefined && formatted !== live.get(name);
  });
  const baseSources = readBaseFiles({ repositoryRoot, mergeBaseSha, files: differing });
  const existing = differing.filter(({ path: name }) => baseSources.get(name) !== undefined);
  const clean = existing.length === 0 ? new Set() : cleanAtBase(existing, baseSources, format);
  const writable = differing.filter(
    ({ path: name }) => baseSources.get(name) === undefined || clean.has(name),
  );
  for (const name of namesOf(writable)) {
    writeFileSync(containedPath(projectRoot, name), first.formatted.get(name));
  }
  return {
    rewritten: namesOf(writable),
    keptAsIs: namesOf(differing.filter((file) => !writable.includes(file))),
    unformattable: first.unformattable ?? [],
  };
}
