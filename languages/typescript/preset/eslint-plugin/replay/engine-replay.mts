import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Rule } from 'eslint';
import { engineFindingsFile } from '../../../../../shared/engine/engine-findings-file.mts';
import { cachedValue } from '../../../../../shared/values/caching/cached-value.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import { FINDING_KIND, isSetKind, type SetKind } from './replay-file.mts';

type Place = { readonly line: number; readonly column: number };
type Conditions = readonly (readonly [string, string])[];
type Holds = (conditions: Conditions, filename: string) => boolean;
type Report = {
  readonly message: string;
  readonly start: Place;
  readonly end: Place | undefined;
  readonly conditions: Conditions;
};
type Replay = {
  readonly covered: ReadonlySet<string>;
  readonly rules: ReadonlySet<string>;
  readonly typedCovered: ReadonlySet<string>;
  readonly typedRules: ReadonlySet<string>;
  readonly reports: ReadonlyMap<string, readonly Report[]>;
};

const NONE: Replay = {
  covered: new Set(),
  rules: new Set(),
  typedCovered: new Set(),
  typedRules: new Set(),
  reports: new Map(),
};
const replays = new Map<string, Replay>();
function reportKey(file: string, ruleId: string): string {
  return JSON.stringify([file, ruleId]);
}

function placeOf(line: unknown, column: unknown): Place | undefined {
  return typeof line === 'number' && typeof column === 'number'
    ? { line, column: column - 1 }
    : undefined;
}

function reportFrom(row: unknown): { readonly key: string; readonly report: Report } | undefined {
  const [name, ruleId, line, column, message, endLine, endColumn, conditions] = listOf(row);
  const start = placeOf(line, column);
  if (start === undefined) {
    return undefined;
  }
  const report = {
    message: String(message),
    start,
    end: placeOf(endLine, endColumn),
    conditions: listOf(conditions).map((pair) => {
      const [kind, value] = listOf(pair).map(String);
      return [kind ?? '', value ?? ''] as const;
    }),
  };
  return { key: reportKey(String(name), String(ruleId)), report };
}

function readReplay(file: string): Replay {
  const sets: Record<SetKind, Set<string>> = {
    file: new Set(),
    rule: new Set(),
    typedFile: new Set(),
    typedRule: new Set(),
  };
  const reports = new Map<string, Report[]>();
  for (const line of readFileSync(file, 'utf8').split(/\r\n|\r|\n/u)) {
    const [kind, value] = line === '' ? [] : listOf(parseJson(line));
    if (isSetKind(kind)) {
      sets[kind].add(String(value));
    }
    const found = kind === FINDING_KIND ? reportFrom(value) : undefined;
    if (found !== undefined) {
      const group = reports.get(found.key) ?? [];
      group.push(found.report);
      reports.set(found.key, group);
    }
  }
  return {
    covered: sets.file,
    rules: sets.rule,
    typedCovered: sets.typedFile,
    typedRules: sets.typedRule,
    reports,
  };
}

function replayOf(): Replay {
  const file = engineFindingsFile();
  return file === undefined || file === '' ? NONE : cachedValue(replays, file, readReplay);
}

function projectFile(context: Pick<Rule.RuleContext, 'cwd' | 'filename'>): string {
  return path.relative(context.cwd, context.filename).replaceAll('\\', '/');
}

export function engineCovers(
  ruleId: string,
  context: Pick<Rule.RuleContext, 'cwd' | 'filename'>,
): boolean {
  const replay = replayOf();
  const covered = replay.typedRules.has(ruleId) ? replay.typedCovered : replay.covered;
  return replay.rules.has(ruleId) && covered.has(projectFile(context));
}

function needsMissingProgram(
  ruleId: string,
  rule: Rule.RuleModule,
  context: Rule.RuleContext,
): boolean {
  if (!replayOf().typedRules.has(ruleId)) {
    return false;
  }
  const docs: unknown = rule.meta?.docs;
  const program = fieldOf(context.sourceCode.parserServices, 'program');
  return (
    fieldOf(docs, 'requiresTypeChecking') === true && (program === undefined || program === null)
  );
}

function locationOf({
  start,
  end,
}: Report): Place | { readonly start: Place; readonly end: Place } {
  return end === undefined ? start : { start, end };
}

function withoutConditions(conditions: Conditions): boolean {
  return conditions.length === 0;
}

export function replayedByEngine(
  ruleId: string,
  rule: Rule.RuleModule,
  holds: Holds = withoutConditions,
): Rule.RuleModule {
  return {
    ...rule,
    create(context) {
      if (!engineCovers(ruleId, context)) {
        return needsMissingProgram(ruleId, rule, context) ? {} : rule.create(context);
      }
      const reports = replayOf().reports.get(reportKey(projectFile(context), ruleId)) ?? [];
      return {
        Program() {
          for (const report of reports.filter((found) =>
            holds(found.conditions, context.filename),
          )) {
            context.report({ message: report.message, loc: locationOf(report) });
          }
        },
      };
    },
  };
}
