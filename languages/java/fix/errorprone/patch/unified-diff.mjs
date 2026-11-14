const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const OLD_FILE = /^--- (.*)$/u;
const NEW_FILE = /^\+\+\+ (.*)$/u;
const NO_NEWLINE = '\\';
const NULL_FILE = '/dev/null';
const KINDS = new Set([' ', '-', '+']);

function pathOf(header) {
  const raw = header.split('\t')[0].trimEnd();
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return unquoted === NULL_FILE ? undefined : unquoted;
}

function countOf(text) {
  return text === undefined ? 1 : Number(text);
}

function rowsOf(text) {
  const rows = text.split('\n');
  return rows.at(-1) === '' ? rows.slice(0, -1) : rows;
}

function lineOf(row) {
  const kind = row === '' ? ' ' : row[0];
  return { kind, text: row === '' ? '' : row.slice(1) };
}

function isHunkRow(row) {
  return row === '' || KINDS.has(row[0]);
}

function seen(lines) {
  return {
    old: lines.filter(({ kind }) => kind !== '+').length,
    added: lines.filter(({ kind }) => kind !== '-').length,
  };
}

function readLines(rows, counts) {
  const lines = [];
  let used = 0;
  for (const row of rows) {
    const { old, added } = seen(lines);
    const complete = old >= counts.old && added >= counts.added;
    if (row[0] === NO_NEWLINE && lines.length > 0) {
      lines.at(-1).noNewline = true;
    } else if (complete || !isHunkRow(row)) {
      break;
    } else {
      lines.push(lineOf(row));
    }
    used += 1;
  }
  return { lines, used };
}

function readHunk(rows, start) {
  const match = HUNK_HEADER.exec(rows[start]);
  const counts = { old: countOf(match[2]), added: countOf(match[4]) };
  const { lines, used } = readLines(rows.slice(start + 1), counts);
  const found = seen(lines);
  if (found.old !== counts.old || found.added !== counts.added) {
    throw new Error(
      `The patch hunk at line ${match[1]} lists ${found.old} old and ${found.added} new lines, not ${counts.old} and ${counts.added}`,
    );
  }
  return {
    hunk: {
      oldStart: Number(match[1]),
      oldCount: counts.old,
      newStart: Number(match[3]),
      newCount: counts.added,
      lines,
    },
    end: start + 1 + used,
  };
}

function isFileStart(rows, index) {
  return OLD_FILE.test(rows[index]) && NEW_FILE.test(rows[index + 1] ?? '');
}

function readFile(rows, start) {
  const hunks = [];
  let cursor = start + 2;
  for (const index of rows.keys()) {
    if (index < cursor) {
      continue;
    }
    if (isFileStart(rows, index)) {
      break;
    }
    if (HUNK_HEADER.test(rows[index])) {
      const read = readHunk(rows, index);
      hunks.push(read.hunk);
      cursor = read.end;
    } else {
      cursor = index + 1;
    }
  }
  return {
    file: {
      oldPath: pathOf(OLD_FILE.exec(rows[start])[1]),
      newPath: pathOf(NEW_FILE.exec(rows[start + 1])[1]),
      hunks,
    },
    end: cursor,
  };
}

export function parseUnifiedDiff(text) {
  const rows = rowsOf(text);
  const files = [];
  let cursor = 0;
  for (const index of rows.keys()) {
    if (index >= cursor && isFileStart(rows, index)) {
      const read = readFile(rows, index);
      files.push(read.file);
      cursor = read.end;
    }
  }
  return files;
}
