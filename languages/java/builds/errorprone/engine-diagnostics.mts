import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EngineFinding } from '../../../../shared/engine/engine-rows.mts';
import { listOf } from '../../../../shared/values/readers.mts';

export type EngineDiagnostic = {
  readonly file: string;
  readonly line: number;
  readonly endLine: number;
  readonly column: number;
  readonly position: number;
  readonly kind: string;
  readonly message: string;
  readonly classAnnotations: readonly string[];
};

export const ENGINE_REPORT = 'errorprone-engine.json';
const SKIPPED = 'errorprone-skipped.txt';
const TAB_STOP = 8;
const texts = new Map<string, string>();

function textOf(file: string): string {
  const known = texts.get(file);
  if (known !== undefined) {
    return known;
  }
  const text = readFileSync(file, 'utf8');
  texts.set(file, text);
  return text;
}

function lineStart(text: string, line: number): number {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf('\n', start);
    if (next === -1) {
      return start;
    }
    start = next + 1;
  }
  return start;
}

export function positionIn(text: string, line: number, column: number): number {
  let position = lineStart(text, line);
  let reached = 1;
  while (reached < column && position < text.length && text[position] !== '\n') {
    reached =
      text[position] === '\t'
        ? Math.floor((reached - 1) / TAB_STOP) * TAB_STOP + TAB_STOP + 1
        : reached + 1;
    position += 1;
  }
  return position;
}

export function diagnosticOf({ file, line, column, message }: EngineFinding): EngineDiagnostic {
  return {
    file,
    line,
    endLine: line,
    column,
    position: positionIn(textOf(file), line, column),
    kind: 'WARNING',
    message,
    classAnnotations: [],
  };
}

export function withEngineDiagnostics(report: unknown, reportRoot: string): unknown {
  const engineReport = path.join(reportRoot, ENGINE_REPORT);
  if (
    !Array.isArray(report) ||
    existsSync(path.join(reportRoot, SKIPPED)) ||
    !existsSync(engineReport)
  ) {
    return report;
  }
  const added: unknown = JSON.parse(readFileSync(engineReport, 'utf8'));
  return Array.isArray(added) ? [...listOf(report), ...listOf(added)] : report;
}
