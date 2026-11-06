import { isUtf8 } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { readBaseFiles } from '../changes.mjs';
import { containedPath } from './contained-path.mjs';
import { keepingLineEndings } from './rewrite/line-endings.mjs';
import { touchedLinesFormatted } from './rewrite/line-hunks.mjs';
import { replaceIfUnchanged } from './rewrite/safe-write.mjs';

function namesOf(files) {
  return files.map(({ path: name }) => name);
}

function cleanAtBase(existing, baseSources, format) {
  const bases = new Map(namesOf(existing).map((name) => [name, baseSources.get(name)]));
  const { formatted } = format(bases);
  return new Set(namesOf(existing).filter((name) => formatted.get(name) === bases.get(name)));
}

function liveSources(projectRoot, files) {
  const bytes = new Map(
    namesOf(files).map((name) => [name, readFileSync(containedPath(projectRoot, name))]),
  );
  const decodable = files.filter(({ path: name }) => isUtf8(bytes.get(name)));
  return {
    bytes,
    decodable,
    undecodable: namesOf(files.filter((file) => !decodable.includes(file))),
    live: new Map(namesOf(decodable).map((name) => [name, bytes.get(name).toString('utf8')])),
  };
}

function plannedTexts({ names, baseSources, clean, live, formatted, touchedLinesOnly }) {
  return names.flatMap((name) => {
    const base = baseSources.get(name);
    if (base === undefined || clean.has(name)) {
      return [{ name, text: formatted.get(name), partly: false }];
    }
    if (!touchedLinesOnly) {
      return [];
    }
    const text = touchedLinesFormatted({
      base,
      live: live.get(name),
      formatted: formatted.get(name),
    });
    return text === live.get(name) ? [] : [{ name, text, partly: true }];
  });
}

function differingFiles(decodable, live, formatted) {
  return decodable.filter(({ path: name }) => {
    const text = formatted.get(name);
    return text !== undefined && text !== live.get(name);
  });
}

export function rewriteFormatted({ projectRoot, repositoryRoot, mergeBaseSha, files, ...options }) {
  const format = keepingLineEndings(options.format);
  const { bytes, decodable, undecodable, live } = liveSources(projectRoot, files);
  const first = decodable.length === 0 ? { formatted: new Map() } : format(live);
  const differing = differingFiles(decodable, live, first.formatted);
  const baseSources = readBaseFiles({ repositoryRoot, mergeBaseSha, files: differing });
  const existing = differing.filter(({ path: name }) => baseSources.get(name) !== undefined);
  const planned = plannedTexts({
    names: namesOf(differing),
    baseSources,
    clean: existing.length === 0 ? new Set() : cleanAtBase(existing, baseSources, format),
    live,
    formatted: first.formatted,
    touchedLinesOnly: options.touchedLinesOnly === true,
  });
  const written = planned.filter(({ name, text }) =>
    replaceIfUnchanged(containedPath(projectRoot, name), bytes.get(name), text),
  );
  return {
    rewritten: written.filter(({ partly }) => !partly).map(({ name }) => name),
    partlyRewritten: written.filter(({ partly }) => partly).map(({ name }) => name),
    keptAsIs: namesOf(differing).filter((name) => !planned.some((entry) => entry.name === name)),
    changedMeanwhile: planned.filter((entry) => !written.includes(entry)).map(({ name }) => name),
    unformattable: first.unformattable ?? [],
    undecodable,
  };
}
