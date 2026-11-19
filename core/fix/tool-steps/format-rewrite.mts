import { isUtf8 } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { readBaseFiles } from '../changes.mts';
import { containedPath } from './paths/contained-path.mts';
import { keepingLineEndings } from './rewrite/line-endings.mts';
import { touchedLinesFormatted } from './rewrite/line-hunks.mts';
import { writeTexts } from '../engine/write-texts.mts';
import { directWriter } from '../engine/writer.mts';
import type { FixFile, FixWriter } from '../typed/fix-types.mts';
import type { Formatter, FormatOutcome } from '../typed/command-types.mts';

type RewriteFile = FixFile & { readonly baseRepositoryPath?: string };
type Planned = { readonly name: string; readonly text: string; readonly partly: boolean };

export type RewriteOptions = {
  readonly projectRoot: string;
  readonly repositoryRoot: string;
  readonly mergeBaseSha: string | undefined;
  readonly files: readonly RewriteFile[];
  readonly format: Formatter;
  readonly formatBase?: Formatter;
  readonly keepLineEndings: boolean;
  readonly writer?: FixWriter;
  readonly allFiles: boolean;
  readonly tool?: string;
  readonly touchedLinesOnly?: true;
};

function namesOf(files: readonly FixFile[]): string[] {
  return files.map(({ path: name }) => name);
}

function cleanAtBase(
  existing: readonly FixFile[],
  baseSources: ReadonlyMap<string, string | undefined>,
  format: Formatter,
): Set<string> {
  const bases = new Map(
    namesOf(existing).map((name): [string, string] => [name, baseSources.get(name) ?? '']),
  );
  const { formatted } = format(bases);
  return new Set(namesOf(existing).filter((name) => formatted.get(name) === bases.get(name)));
}

function liveSources(
  projectRoot: string,
  files: readonly RewriteFile[],
): {
  bytes: Map<string, Buffer>;
  decodable: RewriteFile[];
  undecodable: string[];
  live: Map<string, string>;
} {
  const bytes = new Map(
    namesOf(files).map((name): [string, Buffer] => [
      name,
      readFileSync(containedPath(projectRoot, name)),
    ]),
  );
  const decodable = files.filter(({ path: name }) => isUtf8(bytes.get(name) ?? Buffer.alloc(0)));
  return {
    bytes,
    decodable,
    undecodable: namesOf(files.filter((file) => !decodable.includes(file))),
    live: new Map(
      namesOf(decodable).map((name): [string, string] => [
        name,
        (bytes.get(name) ?? Buffer.alloc(0)).toString('utf8'),
      ]),
    ),
  };
}

function plannedTexts({
  names,
  baseSources,
  clean,
  live,
  formatted,
  touchedLinesOnly,
}: {
  readonly names: readonly string[];
  readonly baseSources: ReadonlyMap<string, string | undefined>;
  readonly clean: ReadonlySet<string>;
  readonly live: ReadonlyMap<string, string>;
  readonly formatted: ReadonlyMap<string, string>;
  readonly touchedLinesOnly: boolean;
}): Planned[] {
  return names.flatMap((name): Planned[] => {
    const base = baseSources.get(name);
    if (base === undefined || clean.has(name)) {
      return [{ name, text: formatted.get(name) ?? '', partly: false }];
    }
    if (!touchedLinesOnly) {
      return [];
    }
    const text = touchedLinesFormatted({
      base,
      live: live.get(name) ?? '',
      formatted: formatted.get(name) ?? '',
    });
    return text === live.get(name) ? [] : [{ name, text, partly: true }];
  });
}

function differingFiles(
  decodable: readonly RewriteFile[],
  live: ReadonlyMap<string, string>,
  formatted: ReadonlyMap<string, string>,
): RewriteFile[] {
  return decodable.filter(({ path: name }) => {
    const text = formatted.get(name);
    return text !== undefined && text !== live.get(name);
  });
}

function formattersOf(options: RewriteOptions): { format: Formatter; formatBase: Formatter } {
  function wrap(format: Formatter): Formatter {
    return options.keepLineEndings ? keepingLineEndings(format) : format;
  }
  return {
    format: wrap(options.format),
    formatBase: wrap(options.formatBase ?? options.format),
  };
}

function baseFilesOf(
  files: readonly RewriteFile[],
): { path: string; baseRepositoryPath: string }[] {
  return files.map(({ path: name, baseRepositoryPath }) => ({
    path: name,
    baseRepositoryPath: baseRepositoryPath ?? name,
  }));
}

export function rewriteFormatted(options: RewriteOptions): FormatOutcome {
  const { projectRoot, repositoryRoot, mergeBaseSha, files } = options;
  const { format, formatBase } = formattersOf(options);
  const { bytes, decodable, undecodable, live } = liveSources(projectRoot, files);
  const first =
    decodable.length === 0
      ? { formatted: new Map<string, string>(), unformattable: undefined }
      : format(live);
  const differing = differingFiles(decodable, live, first.formatted);
  const baseSources = options.allFiles
    ? new Map<string, string | undefined>()
    : readBaseFiles({ repositoryRoot, mergeBaseSha, files: baseFilesOf(differing) });
  const existing = differing.filter(({ path: name }) => baseSources.get(name) !== undefined);
  const planned = plannedTexts({
    names: namesOf(differing),
    baseSources,
    clean: existing.length === 0 ? new Set() : cleanAtBase(existing, baseSources, formatBase),
    live,
    formatted: first.formatted,
    touchedLinesOnly: options.touchedLinesOnly === true,
  });
  const plannedNames = new Set(planned.map(({ name }) => name));
  const { written: names, unwritable } = writeTexts(
    options.writer ?? directWriter(projectRoot),
    planned.map(({ name, text }) => ({ name, bytes: bytes.get(name), text })),
    options.tool,
  );
  const written = planned.filter(({ name }) => names.includes(name));
  const writtenEntries = new Set(written);
  const unwritableNames = new Set(unwritable.map((text) => text.slice(0, text.indexOf(': '))));
  return {
    rewritten: written.filter(({ partly }) => !partly).map(({ name }) => name),
    partlyRewritten: written.filter(({ partly }) => partly).map(({ name }) => name),
    keptAsIs: namesOf(differing).filter((name) => !plannedNames.has(name)),
    changedMeanwhile: planned
      .filter((entry) => !(writtenEntries.has(entry) || unwritableNames.has(entry.name)))
      .map(({ name }) => name),
    unformattable: first.unformattable ?? [],
    undecodable,
    ...(unwritable.length === 0 ? {} : { unwritable }),
  };
}
