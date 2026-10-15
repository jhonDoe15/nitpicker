import { normalizeGitPath } from '../normalize.mjs';
import { joinRepositoryPath, repositoryPath, relativeToProject } from '../paths.mjs';
import { runGit } from '../repository/command.mjs';
import { RENAME_LIMIT_SETTING, RENAME_DETECTION } from './changes.mjs';

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
    RENAME_DETECTION,
    '--no-color',
    '--no-ext-diff',
    `${mergeBaseSha}...${headSha}`,
    '--',
    ...new Set([projectRelativePath, baseProjectRelativePath]),
  ]);
  const changed = parseChangedLines(onlyFilesInside(output, headProject), headProject);
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
    '--no-color',
    '--no-ext-diff',
    baseSide,
    headSide,
  ]);
  return parseChangedLines(output, '.');
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

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseChangedLines(diffText, projectRelativePath = '.') {
  const changed = new Map();
  for (const section of diffText.split(/^(?=diff --git )/m)) {
    const file = parseFileSection(section, projectRelativePath);
    if (file !== undefined) {
      changed.set(file.path, file);
    }
  }
  return changed;
}

function parseFileSection(section, projectRelativePath) {
  const [header = '', ...hunks] = section.split(/^(?=@@ )/m);
  const target = /^\+\+\+ (.+)$/m.exec(header);
  const filePath = target === null ? undefined : diffTargetPath(target[1]);
  if (filePath === undefined) {
    return undefined;
  }
  const file = {
    path: relativeToProject(filePath, projectRelativePath),
    added: /^new file mode/m.test(header),
    ranges: [],
    inserted: [],
  };
  const read = hunks.map((hunk) => recordHunk(file, hunk));
  const added = read.flatMap((hunk) => hunk.added);
  const unpaired = unpairedOffsets(
    read.flatMap((hunk) => hunk.removed),
    added.map(({ text }) => text),
  );
  const insertedLines = [
    ...read.flatMap((hunk) => hunk.inserted),
    ...unpaired.map((index) => added[index].line),
  ].toSorted((left, right) => left - right);
  file.inserted.push(...offsetRanges(0, insertedLines));
  return file;
}

const NO_LINES = { removed: [], added: [], inserted: [] };

function recordHunk(file, hunkText) {
  const [headerLine = '', ...body] = hunkText.split('\n');
  const hunk = HUNK_HEADER.exec(headerLine);
  if (hunk === null) {
    return NO_LINES;
  }
  const removedCount = hunk[1] === undefined ? 1 : Number(hunk[1]);
  const start = Number(hunk[2]);
  const count = hunk[3] === undefined ? 1 : Number(hunk[3]);
  if (count > 0) {
    file.ranges.push([start, start + count - 1]);
  }
  const removed = body.filter((line) => line.startsWith('-')).map((line) => line.slice(1));
  const added = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1));
  if (added.length === count && removed.length === removedCount) {
    return {
      removed,
      added: added.map((text, offset) => ({ line: start + offset, text })),
      inserted: [],
    };
  }
  return {
    removed: [],
    added: [],
    inserted: beyondReplacedOffsets(removedCount, count).map((offset) => start + offset),
  };
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
  return unquoted.replace(/^b\//, '');
}
