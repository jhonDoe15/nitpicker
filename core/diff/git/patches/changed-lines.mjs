import { normalizeGitPath } from '../normalize.mjs';
import { joinRepositoryPath, repositoryPath, relativeToProject } from '../paths.mjs';
import { readBlobTexts } from '../repository/blobs.mjs';
import { runGit } from '../repository/command.mjs';
import { RENAME_LIMIT_SETTING, RENAME_DETECTION } from './changes.mjs';
import { sourceLanguage } from '../../../../shared/source-text/format-tokens.mjs';
import { alignHunks } from '../unchanged-lines.mjs';

export const DIFF_ALGORITHM = '--diff-algorithm=patience';

export function readChangedLines({
  repositoryRoot,
  mergeBaseSha,
  headSha,
  projectRelativePath,
  baseProjectRelativePath = projectRelativePath,
  inferredMoves = new Map(),
}) {
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

function readMovedFileChanges({ repositoryRoot, baseSide, headSide }) {
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
    const sources = { base: texts.get(baseSide), head: texts.get(headSide) };
    return new Map(files.map(({ filePath }) => [filePath, sources]));
  });
}

function committedSources(repositoryRoot, { mergeBaseSha, headSha, files }) {
  const specs = files.map(({ basePath, filePath }) => ({
    base: `${mergeBaseSha}:${basePath}`,
    head: `${headSha}:${filePath}`,
  }));
  const texts = readBlobTexts(
    repositoryRoot,
    specs.flatMap(({ base, head }) => [base, head]),
  );
  return new Map(
    files.map(({ filePath }, index) => [
      filePath,
      { base: texts.get(specs[index].base), head: texts.get(specs[index].head) },
    ]),
  );
}

function onlyFilesInside(diffText, projectRelativePath) {
  if (projectRelativePath === '.' || projectRelativePath.length === 0) {
    return diffText;
  }
  return diffText
    .split(/^(?=diff --git )/m)
    .filter((section) => sectionIsInside(section, projectRelativePath))
    .join('');
}

function sectionIsInside(section, projectRelativePath) {
  const target = /^\+\+\+ (.+)$/m.exec(section);
  const filePath = target === null ? undefined : diffTargetPath(target[1]);
  return filePath === undefined || normalizeGitPath(filePath).startsWith(`${projectRelativePath}/`);
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseChangedLines(diffText, projectRelativePath = '.', readSources = undefined) {
  const sections = diffText
    .split(/^(?=diff --git )/m)
    .map(parseFileSection)
    .filter((section) => section !== undefined);
  const sources = readSources?.(sections.filter(isAlignable)) ?? new Map();
  return new Map(
    sections.map((section) => {
      const file = fileChanges(section, sources.get(section.filePath), projectRelativePath);
      return [file.path, file];
    }),
  );
}

function isAlignable({ added, basePath, filePath, hunks }) {
  return (
    !added && basePath !== undefined && hunks.length > 0 && sourceLanguage(filePath) !== undefined
  );
}

function parseFileSection(section) {
  const [header = '', ...hunkTexts] = section.split(/^(?=@@ )/m);
  const target = /^\+\+\+ (.+)$/m.exec(header);
  const filePath = target === null ? undefined : diffTargetPath(target[1]);
  if (filePath === undefined) {
    return undefined;
  }
  const source = /^--- (.+)$/m.exec(header);
  return {
    filePath,
    basePath: source === null ? undefined : diffTargetPath(source[1]),
    added: /^new file mode/m.test(header),
    hunks: hunkTexts.map(readHunk).filter((hunk) => hunk !== undefined),
  };
}

function fileChanges({ filePath, added, hunks }, sources, projectRelativePath) {
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
  };
}

function onlyChanged(lines, aligned) {
  return aligned === undefined ? lines : lines.filter((line) => aligned.changed.has(line));
}

function insertedLines(hunks) {
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
    ...unpaired.map((index) => added[index].line),
  ].toSorted((left, right) => left - right);
}

function readHunk(hunkText) {
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

function countOf(group) {
  return group === undefined ? 1 : Number(group);
}

function beyondReplacedOffsets(removedCount, count) {
  return Array.from(
    { length: Math.max(count - removedCount, 0) },
    (_, index) => removedCount + index,
  );
}

const EDITED_LINE_SIMILARITY = 0.5;

function unpairedOffsets(removed, added) {
  const removedWords = removed.map(wordsOf);
  const addedWords = added.map(wordsOf);
  const candidates = addedWords
    .flatMap((words, addedIndex) =>
      removedWords.map((before, removedIndex) => ({
        addedIndex,
        removedIndex,
        score: similarity(before, words),
      })),
    )
    .filter(({ score }) => score >= EDITED_LINE_SIMILARITY)
    .toSorted((left, right) => right.score - left.score);
  const pairedAdded = new Set();
  const pairedRemoved = new Set();
  for (const { addedIndex, removedIndex } of candidates) {
    if (!pairedAdded.has(addedIndex) && !pairedRemoved.has(removedIndex)) {
      pairedAdded.add(addedIndex);
      pairedRemoved.add(removedIndex);
    }
  }
  return added.flatMap((_, index) => (pairedAdded.has(index) ? [] : [index]));
}

function wordsOf(line) {
  return line.match(/[\p{L}\p{N}_$]+/gu) ?? [];
}

function wordCounts(words) {
  const counts = new Map();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

function similarity(before, after) {
  const total = before.length + after.length;
  if (total === 0) {
    return 1;
  }
  const beforeCounts = wordCounts(before);
  const shared = [...wordCounts(after)].reduce(
    (sum, [word, count]) => sum + Math.min(count, beforeCounts.get(word) ?? 0),
    0,
  );
  return (2 * shared) / total;
}

function offsetRanges(start, offsets) {
  const ranges = [];
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

function diffTargetPath(target) {
  const unquoted = target.startsWith('"') ? JSON.parse(target) : target.replace(/\t.*$/, '');
  if (unquoted === '/dev/null') {
    return undefined;
  }
  return unquoted.replace(/^[ab]\//, '');
}
