import path from 'node:path';
import { moduleFileText } from '../execution/go-module.mts';
import { formatAgnosticText, hash, nextOccurrence } from '../typed/shared-readers.mts';
import type { Diagnostic, FindingRow, SourcePosition } from '../go-types.mts';

const POSITION = /^(.+\.go):(\d+)(?::(\d+))?$/u;
const LINE_REFERENCE = /\b(?:line|at) \d+\b|\.go:\d+(?::\d+)?/gu;

function relativeGoPath(projectRoot: string, file: string) {
  const absolute = path.resolve(projectRoot, file);
  const relative = path.relative(projectRoot, absolute);
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep).join('/');
}

export function parsePosition(projectRoot: string, position: string): SourcePosition | undefined {
  const match = POSITION.exec(position.trim());
  if (match === null) {
    return undefined;
  }
  const file = relativeGoPath(projectRoot, match[1] ?? '');
  return file === undefined
    ? undefined
    : {
        file,
        line: Number(match[2]),
        column: match[3] === undefined ? undefined : Number(match[3]),
      };
}

function sourceLineReader(projectRoot: string) {
  const files = new Map<string, string[]>();
  return (file: string, line: number) => {
    if (!files.has(file)) {
      files.set(file, (moduleFileText(projectRoot, file) ?? '').split(/\r?\n/u));
    }
    const text = files.get(file)?.[line - 1] ?? '';
    return formatAgnosticText(text, file) || text.trim();
  };
}

export function diagnosticFindings(
  projectRoot: string,
  diagnostics: readonly Diagnostic[],
): FindingRow[] {
  const occurrences = new Map<string, number>();
  const sourceLine = sourceLineReader(projectRoot);
  const seen = new Set();
  return diagnostics.flatMap(
    ({ tool, rule, file, line, column, message, classification = 'enforceable' }) => {
      const exact = `${tool}\0${rule}\0${file}\0${String(line)}\0${String(column)}\0${message}`;
      if (seen.has(exact)) {
        return [];
      }
      seen.add(exact);
      const subject = hash(`${message.replace(LINE_REFERENCE, '')}\0${sourceLine(file, line)}`);
      const occurrence = nextOccurrence(occurrences, `${tool}\0${rule}\0${file}\0${subject}`);
      return [
        {
          tool,
          rule,
          path: file,
          identity: `${subject}:occurrence:${String(occurrence)}`,
          message,
          classification,
          location: column === undefined ? { line } : { line, column },
        },
      ];
    },
  );
}
