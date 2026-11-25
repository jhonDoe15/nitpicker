import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EngineFinding } from '../../../../shared/engine/engine-rows.mts';
import { readJson } from '../../../../shared/hygiene/files/known-files.mts';
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
function lineStart(text: string, line: number): number {
  const lines = text.split('\n');
  return lines
    .slice(0, Math.max(Math.min(line, lines.length) - 1, 0))
    .reduce((start, before) => start + before.length + 1, 0);
}

function nextColumn(reached: number, character: string): number {
  return character === '\t'
    ? Math.floor((reached - 1) / TAB_STOP) * TAB_STOP + TAB_STOP + 1
    : reached + 1;
}

export function positionIn(text: string, line: number, column: number): number {
  const start = lineStart(text, line);
  const end = text.indexOf('\n', start);
  const characters = text.slice(start, end === -1 ? text.length : end).split('');
  let reached = 1;
  let offset = 0;
  for (const character of characters) {
    if (reached >= column) {
      break;
    }
    reached = nextColumn(reached, character);
    offset += 1;
  }
  return start + offset;
}

function diagnosticIn(
  { file, line, column, message }: EngineFinding,
  texts: Map<string, string>,
): EngineDiagnostic {
  const text = texts.get(file) ?? readFileSync(file, 'utf8');
  texts.set(file, text);
  return {
    file,
    line,
    endLine: line,
    column,
    position: positionIn(text, line, column),
    kind: 'WARNING',
    message,
    classAnnotations: [],
  };
}

export function diagnosticsOf(findings: readonly EngineFinding[]): EngineDiagnostic[] {
  const texts = new Map<string, string>();
  return findings.map((finding) => diagnosticIn(finding, texts));
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
  const added = readJson(engineReport).value;
  return Array.isArray(added) ? [...listOf(report), ...listOf(added)] : report;
}
