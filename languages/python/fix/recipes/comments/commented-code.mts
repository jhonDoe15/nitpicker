import type { FileRecipe, PlanContext, Planned, RecipeFix } from '../../typed/fix-types.mts';
import { confidentlyCode, shapeOf } from './code-shapes.mts';

const RULE = { tool: 'ruff', rule: 'ERA001' };
const LEGAL = /\b(?:copyright|licen[cs]e|spdx)\b/iu;
const LINE_END = /\n/gu;

type Run = { readonly first: number; readonly start: number; readonly end: number };

function lineStarts(text: string): number[] {
  return [0, ...[...text.matchAll(LINE_END)].map(({ index }) => index + 1)];
}

function isComment(line: string | undefined): boolean {
  return line?.trim().startsWith('#') === true;
}

function groupEnds(lines: readonly string[], row: number): { top: number; bottom: number } {
  const above = Array.from({ length: row - 1 }, (_, offset) => row - 1 - offset);
  const below = Array.from({ length: lines.length - row }, (_, offset) => row + 1 + offset);
  const top = above.find((at) => !isComment(lines[at - 1])) ?? 0;
  const bottom = below.find((at) => !isComment(lines[at - 1])) ?? lines.length + 1;
  return { top: top + 1, bottom: bottom - 1 };
}

function runOf(lines: readonly string[], row: number): Run | undefined {
  if (!isComment(lines[row - 1])) {
    return undefined;
  }
  const { top, bottom } = groupEnds(lines, row);
  const above = Array.from({ length: row - top }, (_, offset) => row - 1 - offset);
  const stop = above.find((at) => shapeOf(lines[at - 1] ?? '') === 'prose');
  const reach = stop === undefined ? top : stop + 1;
  const body = Array.from({ length: row - reach }, (_, offset) => reach + offset);
  const start = body.find((at) => shapeOf(lines[at - 1] ?? '') !== 'neutral') ?? row;
  const texts = lines.slice(start - 1, bottom);
  return confidentlyCode(texts) ? { first: row, start, end: bottom } : undefined;
}

function runsOf(lines: readonly string[], rows: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const row of [...new Set(rows)].toSorted((left, right) => left - right)) {
    const run = runOf(lines, row);
    if (run !== undefined && !runs.some(({ end }) => end >= run.start)) {
      runs.push(run);
    }
  }
  return runs;
}

function fixesOf(name: string, text: string, rows: readonly number[]): RecipeFix[] {
  const starts = lineStarts(text);
  const lines = text.split('\n');
  const header = lines.findIndex((line) => line.trim() !== '' && !isComment(line));
  return runsOf(lines, rows)
    .filter(
      ({ start, end }) =>
        !(
          (header === -1 || start <= header) &&
          lines.slice(start - 1, end).some((line) => LEGAL.test(line))
        ),
    )
    .map(({ first, start, end }) => ({
      finding: { ...RULE, path: name, line: first },
      edits: [
        {
          type: 'replace' as const,
          path: name,
          start: starts[start - 1] ?? 0,
          end: starts[end] ?? text.length,
          text: '',
        },
      ],
    }));
}

export const pythonCommentedCodeRecipe: FileRecipe = {
  id: 'python-commented-out-code',
  rules: [RULE],
  presets: ['python'],
  scope: 'file',
  safety: 'safe',
  plan({ files, inputs }: PlanContext): Planned {
    const recorded = inputs.pythonCommentedCode ?? {};
    return {
      fixes: files
        .filter(({ path: name }) => inputs.isExcepted?.('ruff/ERA001', name) !== true)
        .flatMap(({ path: name, text }) => {
          const entry = recorded[name];
          return entry?.text === text ? fixesOf(name, text, entry.lines) : [];
        }),
    };
  },
};
