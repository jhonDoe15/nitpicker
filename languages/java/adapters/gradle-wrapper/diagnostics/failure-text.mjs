import { withoutSnapshotRoot } from '../../../../../core/diff/snapshot-root/snapshot-root.mjs';
import { compileErrorsIn } from '../../../builds/compile-errors/compiler-output.mjs';

const TOOL_NOISE = [
  /Picked up (?:JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|JDK_JAVA_OPTIONS):/u,
  /PIT >> INFO\b/u,
  /^\[ant:checkstyle\] /u,
  /^SLF4J\(W\): /u,
];
const GRADLE_DOCS =
  /please refer to https:\/\/docs\.gradle\.org|^BUILD FAILED in |^> Get more help at/u;
const FAILURE_START = /^(?:FAILURE: |\* What went wrong:)/u;
const SECTION = /^\* (?<name>[A-Z][\w ]*):$/u;
const CHAIN = /^(?<indent>\s*)> (?<text>.+)$/u;
const CAUSE = /^\s*Caused by:/u;
const OWN_INIT_SCRIPT = /nitpicker\.init\.gradle\b/u;
const MAX_LINES = 12;
const MAX_LINE_LENGTH = 300;

export function withoutToolNoise(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !TOOL_NOISE.some((noise) => noise.test(line)))
    .join('\n')
    .trim();
}

function sections(lines) {
  const found = [];
  let current;
  for (const line of lines) {
    const name = SECTION.exec(line)?.groups.name;
    if (name !== undefined) {
      current = { name, lines: [] };
      found.push(current);
    } else if (current !== undefined && !GRADLE_DOCS.test(line) && line.trim() !== '') {
      current.lines.push(line);
    }
  }
  return found;
}

function chainEntries(lines) {
  return lines.flatMap((line) => {
    const match = CHAIN.exec(line);
    if (match !== null) {
      return [{ depth: match.groups.indent.length, text: match.groups.text.trim() }];
    }
    return /^\s/u.test(line) ? [] : [{ depth: -1, text: line.trim() }];
  });
}

function isLeaf(entries, index) {
  return entries[index].depth >= 0 && !(entries[index + 1]?.depth > entries[index].depth);
}

function causeOf(lines) {
  const entries = chainEntries(lines);
  if (entries.every(({ depth }) => depth < 0)) {
    return entries.map(({ text }) => text);
  }
  return entries.flatMap((entry, index) => {
    if (!isLeaf(entries, index)) {
      return [];
    }
    const parent = entries.slice(0, index).findLast(({ depth }) => depth < entry.depth);
    return [...(parent === undefined ? [] : [parent.text]), `> ${entry.text}`];
  });
}

function failureLines(lines) {
  return sections(lines).flatMap(({ name, lines: body }) => {
    if (name === 'Where') {
      return body.some((line) => OWN_INIT_SCRIPT.test(line)) ? [] : body.map((line) => line.trim());
    }
    return name === 'What went wrong' ? causeOf(body) : [];
  });
}

function compilerLines(text, projectRoot) {
  return compileErrorsIn(text, projectRoot).map(
    ({ path: file, line, message }) => `${file}:${String(line)}: error: ${message}`,
  );
}

function withoutProjectRoot(line, projectRoot) {
  return withoutSnapshotRoot(line, { projectRoot, snapshot: '.' });
}

function fitted(lines, projectRoot) {
  return [...new Set(lines.map((line) => withoutProjectRoot(line, projectRoot)))]
    .slice(0, MAX_LINES)
    .map((line) => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line));
}

export function condenseFailure(text, projectRoot) {
  const lines = withoutToolNoise(text).split('\n');
  const start = lines.findIndex((line) => FAILURE_START.test(line));
  const before = start < 0 ? lines : lines.slice(0, start);
  const failure = start < 0 ? [] : failureLines(lines.slice(start));
  const causes = before.filter((line) => CAUSE.test(line)).map((line) => line.trim());
  const kept = [...compilerLines(text, projectRoot), ...failure, ...causes];
  const tail = lines.filter((line) => line.trim() !== '' && !GRADLE_DOCS.test(line));
  return fitted(kept.length > 0 ? kept : tail.slice(-MAX_LINES), projectRoot).join('\n');
}
