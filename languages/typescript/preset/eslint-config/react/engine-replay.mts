import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';
import { cachedValue } from '../../../../../shared/values/caching/cached-value.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';

type Place = { readonly line: number; readonly column: number };
type Report = { readonly message: string; readonly start: Place; readonly end: Place | undefined };
type Replay = {
  readonly covered: ReadonlySet<string>;
  readonly reports: ReadonlyMap<string, readonly Report[]>;
};

export const ENGINE_FINDINGS_FILE = 'NITPICKER_ENGINE_LINT_FINDINGS';

const NONE: Replay = { covered: new Set(), reports: new Map() };
const replays = new Map<string, Replay>();
const source: { file: string | undefined } = { file: undefined };

export function replayEngineFindingsFrom(file: string | undefined): void {
  source.file = file;
}

function reportKey(file: string, ruleId: string): string {
  return JSON.stringify([file, ruleId]);
}

function placeOf(line: unknown, column: unknown): Place | undefined {
  return typeof line === 'number' && typeof column === 'number'
    ? { line, column: column - 1 }
    : undefined;
}

function readReplay(file: string): Replay {
  const written = parseJson(readFileSync(file, 'utf8'));
  const reports = new Map<string, Report[]>();
  for (const row of listOf(fieldOf(written, 'findings'))) {
    const [name, ruleId, line, column, message, endLine, endColumn] = listOf(row);
    const start = placeOf(line, column);
    if (start !== undefined) {
      const key = reportKey(String(name), String(ruleId));
      const report = { message: String(message), start, end: placeOf(endLine, endColumn) };
      reports.set(key, [...(reports.get(key) ?? []), report]);
    }
  }
  return { covered: new Set(listOf(fieldOf(written, 'files')).map(String)), reports };
}

function replayOf(): Replay {
  const { file } = source;
  return file === undefined || file === '' ? NONE : cachedValue(replays, file, readReplay);
}

function projectFile(context: Pick<Rule.RuleContext, 'cwd' | 'filename'>): string {
  return path.relative(context.cwd, context.filename).replaceAll('\\', '/');
}

export function engineCovers(context: Pick<Rule.RuleContext, 'cwd' | 'filename'>): boolean {
  return replayOf().covered.has(projectFile(context));
}

function locationOf({
  start,
  end,
}: Report): Place | { readonly start: Place; readonly end: Place } {
  return end === undefined ? start : { start, end };
}

export function replayedByEngine(ruleId: string, rule: Rule.RuleModule): Rule.RuleModule {
  return {
    ...rule,
    create(context) {
      if (!engineCovers(context)) {
        return rule.create(context);
      }
      const reports = replayOf().reports.get(reportKey(projectFile(context), ruleId)) ?? [];
      return {
        Program() {
          for (const report of reports) {
            context.report({ message: report.message, loc: locationOf(report) });
          }
        },
      };
    },
  };
}
