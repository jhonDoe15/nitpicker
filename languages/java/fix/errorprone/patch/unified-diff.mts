const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const OLD_FILE = /^--- (.*)$/u;
const NEW_FILE = /^\+\+\+ (.*)$/u;
const NO_NEWLINE = '\\';
const NULL_FILE = '/dev/null';
const KINDS = new Set([' ', '-', '+']);

export type HunkLine = { readonly kind: string; readonly text: string; readonly noNewline?: true };
export type Hunk = {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly HunkLine[];
};
export type PatchFile = {
  readonly oldPath: string | undefined;
  readonly newPath: string | undefined;
  readonly hunks: readonly Hunk[];
};
type Counts = { readonly old: number; readonly added: number };
type Read<T> = T & { readonly end: number };

function pathOf(header: string): string | undefined {
  const raw = (header.split('\t')[0] ?? '').trimEnd();
  const unquoted = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return unquoted === NULL_FILE ? undefined : unquoted;
}

function countOf(text: string | undefined): number {
  return text === undefined ? 1 : Number(text);
}

function rowsOf(text: string): string[] {
  const rows = text.split('\n');
  return rows.at(-1) === '' ? rows.slice(0, -1) : rows;
}

function lineOf(row: string): HunkLine {
  const kind = row === '' ? ' ' : row.charAt(0);
  return { kind, text: row === '' ? '' : row.slice(1) };
}

function isHunkRow(row: string): boolean {
  return row === '' || KINDS.has(row.charAt(0));
}

function seen(lines: readonly HunkLine[]): Counts {
  return {
    old: lines.filter(({ kind }) => kind !== '+').length,
    added: lines.filter(({ kind }) => kind !== '-').length,
  };
}

function readLines(
  rows: readonly string[],
  counts: Counts,
): { readonly lines: HunkLine[]; readonly used: number } {
  const lines: HunkLine[] = [];
  let used = 0;
  for (const row of rows) {
    const { old, added } = seen(lines);
    const complete = old >= counts.old && added >= counts.added;
    const last = lines.at(-1);
    if (row.startsWith(NO_NEWLINE) && last !== undefined) {
      lines[lines.length - 1] = { ...last, noNewline: true };
    } else if (complete || !isHunkRow(row)) {
      break;
    } else {
      lines.push(lineOf(row));
    }
    used += 1;
  }
  return { lines, used };
}

function readHunk(rows: readonly string[], start: number): Read<{ readonly hunk: Hunk }> {
  const match = HUNK_HEADER.exec(rows[start] ?? '') ?? [];
  const counts = { old: countOf(match[2]), added: countOf(match[4]) };
  const { lines, used } = readLines(rows.slice(start + 1), counts);
  const found = seen(lines);
  if (found.old !== counts.old || found.added !== counts.added) {
    throw new Error(
      `The patch hunk at line ${String(match[1])} lists ${String(found.old)} old and ${String(found.added)} new lines, not ${String(counts.old)} and ${String(counts.added)}`,
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

function isFileStart(rows: readonly string[], index: number): boolean {
  return OLD_FILE.test(rows[index] ?? '') && NEW_FILE.test(rows[index + 1] ?? '');
}

function readFile(rows: readonly string[], start: number): Read<{ readonly file: PatchFile }> {
  const hunks: Hunk[] = [];
  let cursor = start + 2;
  for (const index of rows.keys()) {
    if (index < cursor) {
      continue;
    }
    if (isFileStart(rows, index)) {
      break;
    }
    if (HUNK_HEADER.test(rows[index] ?? '')) {
      const read = readHunk(rows, index);
      hunks.push(read.hunk);
      cursor = read.end;
    } else {
      cursor = index + 1;
    }
  }
  return {
    file: {
      oldPath: pathOf(OLD_FILE.exec(rows[start] ?? '')?.[1] ?? ''),
      newPath: pathOf(NEW_FILE.exec(rows[start + 1] ?? '')?.[1] ?? ''),
      hunks,
    },
    end: cursor,
  };
}

export function parseUnifiedDiff(text: string): PatchFile[] {
  const rows = rowsOf(text);
  const files: PatchFile[] = [];
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
