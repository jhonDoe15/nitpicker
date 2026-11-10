import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const FILE = String.raw`(?<file>(?:file://)?(?:[A-Za-z]:)?[^:\s][^:\n]*?\.(?:java|kts?))`;
const FILE_URL = /^file:\/\/(?:\/(?=[A-Za-z]:))?/u;
const JAVAC = new RegExp(
  String.raw`^\s*(?:\[ERROR\]\s+)?${FILE}:(?<line>\d+): error: (?<message>.+)$`,
  'u',
);
const POSITIONED = [
  String.raw`:\[(?<line>\d+),(?<column>\d+)\] (?<message>.+)`,
  String.raw`:(?<line>\d+):(?<column>\d+):? (?<message>.+)`,
  String.raw`: \((?<line>\d+), (?<column>\d+)\):? (?<message>.+)`,
].map((position) => new RegExp(String.raw`^\s*(?:\[ERROR\]|e:)\s+${FILE}${position}$`, 'u'));
const SYMBOL = /^\s*(?:\[ERROR\]\s+)?symbol:\s+(?<symbol>\S.*)$/u;
const SYMBOL_LOOKAHEAD = 4;
const ERROR_PREFIX = /^error: /u;

function realOrSame(file) {
  return existsSync(file) ? realpathSync.native(file) : file;
}

function insidePath(root, file) {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    return undefined;
  }
  return existsSync(absolute) ? path.relative(root, absolute).split(path.sep).join('/') : undefined;
}

function projectPath(projectRoot, reported) {
  const file = reported.replace(FILE_URL, '');
  return insidePath(projectRoot, file) ?? insidePath(realOrSame(projectRoot), file);
}

function errorMatch(line) {
  return [JAVAC, ...POSITIONED].map((pattern) => pattern.exec(line)).find(Boolean)?.groups;
}

function symbolAfter(lines, index) {
  for (const line of lines.slice(index + 1, index + 1 + SYMBOL_LOOKAHEAD)) {
    if (errorMatch(line) !== undefined) {
      return undefined;
    }
    const symbol = SYMBOL.exec(line)?.groups.symbol;
    if (symbol !== undefined) {
      return symbol.trim();
    }
  }
  return undefined;
}

function compileError(projectRoot, lines, index) {
  const match = errorMatch(lines[index]);
  const file = match === undefined ? undefined : projectPath(projectRoot, match.file.trim());
  if (file === undefined) {
    return undefined;
  }
  const symbol = symbolAfter(lines, index);
  const text = match.message.trim().replace(ERROR_PREFIX, '');
  return {
    path: file,
    line: Number(match.line),
    ...(match.column === undefined ? {} : { column: Number(match.column) }),
    message: symbol === undefined ? text : `${text} (${symbol})`,
  };
}

export function compileErrorsIn(output, projectRoot) {
  const lines = String(output).split(/\r?\n/u);
  const seen = new Set();
  return lines.flatMap((_, index) => {
    const error = compileError(projectRoot, lines, index);
    const key =
      error === undefined
        ? undefined
        : `${error.path}:${String(error.line)}:${String(error.column)}:${error.message}`;
    if (key === undefined || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [error];
  });
}
