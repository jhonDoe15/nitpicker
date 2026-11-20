import { parseJson, textOf } from '../../../../shared/values/readers.mts';
import { normalizeGitPath } from '../normalize.mts';
import { joinRepositoryPath, repositoryPath, relativeToProject } from '../paths.mts';
import { readBlobTexts } from '../repository/blobs.mts';
import { runGit } from '../repository/command.mts';
import { RENAME_LIMIT_SETTING, RENAME_DETECTION } from './changes.mts';
import { alignHunks } from '../unchanged-lines.mts';
import type {
  Alignment,
  ChangedFile,
  ChangedLinesRequest,
  FileSection,
  Hunk,
  LineRange,
  LineSources,
  ReadSources,
  SourceRequest,
} from '../line-types.mts';
import { languageOfPath } from '../source-views.mts';
import { beyondReplacedOffsets, unpairedOffsets } from '../edited-lines.mts';

export const DIFF_ALGORITHM = '--diff-algorithm=patience';

export function readChangedLines({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  inferredMoves = new Map<string, string>(),
}: ChangedLinesRequest): Map<string, ChangedFile> {
  const headProject = normalizeGitPath(projectRelativePath).replace(/\/$/, '');
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    '-c',
    RENAME_LIMIT_SETTING,
    'diff',
    '--unified=0',
    DIFF_ALGORITHM,
    RENAME_DETECTION,
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    ...new Set([projectRelativePath, baseProjectRelativePath]),
  ]);
  const changed = parseChangedLines(onlyFilesInside(output, headProject), headProject, (files) =>
    committedSources(repositoryRoot, { mergeBaseSha, headSha, files }),
  );
  for (const [basePath, headPath] of inferredMoves) {
    const movedChanges = readMovedFileChanges({
      repositoryRoot,
      baseSide: `${mergeBaseSha}:${joinRepositoryPath(repositoryPath(baseProjectRelativePath), basePath)}`,
      headSide: `${headSha}:${joinRepositoryPath(repositoryPath(headProject), headPath)}`,
    });
    changed.delete(headPath);
    for (const entry of movedChanges.values()) {
      changed.set(headPath, { ...entry, path: headPath });
    }
  }
  return changed;
}

function readMovedFileChanges({
  repositoryRoot,
  baseSide,
  headSide,
}: {
  readonly repositoryRoot: string;
  readonly baseSide: string;
  readonly headSide: string;
}): Map<string, ChangedFile> {
  const output = runGit(repositoryRoot, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--unified=0',
    DIFF_ALGORITHM,
    '--no-color',
    '--no-ext-diff',
    baseSide,
    headSide,
  ]);
  return parseChangedLines(output, '.', (files) => {
    const texts = readBlobTexts(repositoryRoot, [baseSide, headSide]);
    const sources: LineSources = { base: texts.get(baseSide), head: texts.get(headSide) };
    return new Map(files.map(({ filePath }) => [filePath, sources]));
  });
}

function committedSources(
  repositoryRoot: string,
  {
    mergeBaseSha,
    headSha,
    files,
  }: { readonly mergeBaseSha: string; readonly headSha: string; readonly files: SourceRequest[] },
): Map<string, LineSources> {
  const specs = files.map(({ basePath, filePath }) => ({
    base: `${mergeBaseSha}:${String(basePath)}`,
    head: `${headSha}:${filePath}`,
  }));
  const texts = readBlobTexts(
    repositoryRoot,
    specs.flatMap(({ base, head }) => [base, head]),
  );
  return new Map(
    files.map(({ filePath }, index): [string, LineSources] => [
      filePath,
      { base: texts.get(specs[index]?.base ?? ''), head: texts.get(specs[index]?.head ?? '') },
    ]),
  );
}

function onlyFilesInside(diffText: string, projectRelativePath: string): string {
  if (projectRelativePath === '.' || projectRelativePath.length === 0) {
    return diffText;
  }
  return diffText
    .split(/^(?=diff --git )/m)
    .filter((section) => sectionIsInside(section, projectRelativePath))
    .join('');
}

function sectionIsInside(section: string, projectRelativePath: string): boolean {
  const target = /^\+\+\+ (.+)$/m.exec(section);
  const filePath = target?.[1] === undefined ? undefined : diffTargetPath(target[1]);
  return filePath === undefined || normalizeGitPath(filePath).startsWith(`${projectRelativePath}/`);
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseChangedLines(
  diffText: string,
  projectRelativePath = '.',
  readSources?: ReadSources,
): Map<string, ChangedFile> {
  const sections = diffText
    .split(/^(?=diff --git )/m)
    .map(parseFileSection)
    .filter((section) => section !== undefined);
  const sources = readSources?.(sections.filter(isAlignable)) ?? new Map<string, LineSources>();
  return new Map(
    sections.map((section): [string, ChangedFile] => {
      const file = fileChanges(section, sources.get(section.filePath), projectRelativePath);
      return [file.path, file];
    }),
  );
}

function isAlignable({ added, basePath, filePath, hunks }: FileSection): boolean {
  return (
    !added && basePath !== undefined && hunks.length > 0 && languageOfPath(filePath) !== undefined
  );
}

function parseFileSection(section: string): FileSection | undefined {
  const [header = '', ...hunkTexts] = section.split(/^(?=@@ )/m);
  const target = /^\+\+\+ (.+)$/m.exec(header);
  const filePath = target?.[1] === undefined ? undefined : diffTargetPath(target[1]);
  if (filePath === undefined) {
    return undefined;
  }
  const source = /^--- (.+)$/m.exec(header);
  return {
    filePath,
    basePath: source?.[1] === undefined ? undefined : diffTargetPath(source[1]),
    added: /^new file mode/m.test(header),
    hunks: hunkTexts.map(readHunk).filter((hunk) => hunk !== undefined),
  };
}

function fileChanges(
  { filePath, added, hunks }: FileSection,
  sources: LineSources | undefined,
  projectRelativePath: string,
): ChangedFile {
  const aligned = alignHunks(hunks, filePath, sources);
  const headLines = hunks.flatMap(({ head }) =>
    Array.from({ length: head.count }, (_, offset) => head.start + offset),
  );
  return {
    path: relativeToProject(filePath, projectRelativePath),
    added,
    ranges: offsetRanges(0, onlyChanged(headLines, aligned)),
    inserted: offsetRanges(0, onlyChanged(insertedLines(hunks), aligned)),
    deletions: hunks.filter(({ head }) => head.count === 0).map(({ head }) => head.start),
    hunks: hunks.map(({ base, head }) => [base.start, base.count, head.start, head.count]),
    carried: aligned?.carried ?? [],
    ...(aligned === undefined ? {} : { sources }),
  };
}

function onlyChanged(lines: number[], aligned: Alignment | undefined): number[] {
  return aligned === undefined ? lines : lines.filter((line) => aligned.changed.has(line));
}

function insertedLines(hunks: readonly Hunk[]): number[] {
  const complete = hunks.filter((hunk) => hunk.complete);
  const added = complete.flatMap(({ head }) =>
    head.lines.map((text, offset) => ({ line: head.start + offset, text })),
  );
  const unpaired = unpairedOffsets(
    complete.flatMap(({ base }) => base.lines),
    added.map(({ text }) => text),
  );
  return [
    ...hunks
      .filter((hunk) => !hunk.complete)
      .flatMap(({ base, head }) =>
        beyondReplacedOffsets(base.count, head.count).map((offset) => head.start + offset),
      ),
    ...unpaired.flatMap((index) => added[index]?.line ?? []),
  ].toSorted((left, right) => left - right);
}

function readHunk(hunkText: string): Hunk | undefined {
  const [headerLine = '', ...body] = hunkText.split('\n');
  const hunk = HUNK_HEADER.exec(headerLine);
  if (hunk === null) {
    return undefined;
  }
  const removed = body.filter((line) => line.startsWith('-')).map((line) => line.slice(1));
  const added = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1));
  const base = { start: Number(hunk[1]), count: countOf(hunk[2]), lines: removed };
  const head = { start: Number(hunk[3]), count: countOf(hunk[4]), lines: added };
  return {
    base,
    head,
    complete: added.length === head.count && removed.length === base.count,
  };
}

function countOf(group: string | undefined): number {
  return group === undefined ? 1 : Number(group);
}

function offsetRanges(start: number, offsets: readonly number[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const offset of offsets) {
    const line = start + offset;
    const last = ranges.at(-1);
    if (last !== undefined && last[1] === line - 1) {
      last[1] = line;
    } else {
      ranges.push([line, line]);
    }
  }
  return ranges;
}

function diffTargetPath(target: string): string | undefined {
  const unquoted = target.startsWith('"') ? textOf(parseJson(target)) : target.replace(/\t.*$/, '');
  if (unquoted === '/dev/null') {
    return undefined;
  }
  return unquoted.replace(/^[ab]\//, '');
}
