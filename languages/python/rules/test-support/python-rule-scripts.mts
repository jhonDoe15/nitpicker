import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RULES_REPORT, checkRules } from '../../adapters/analysis/python-ast-rules.mts';
import { afterEach, describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mts';
import { createToolContext } from '../../adapters/python-tools.mts';
import type { ToolContext } from '../../adapters/typed/context/tool-context-types.mts';

export type RuleEntry = {
  readonly rule: string;
  readonly path: string;
  readonly line: number;
  readonly subject: string;
  readonly via?: string;
  readonly data?: unknown;
};
export type ScriptFiles = Readonly<Record<string, string>>;
export type ScriptSettings = Readonly<Record<string, unknown>>;
export type CaseSpec =
  | string
  | { readonly file?: string; readonly code: string; readonly files?: undefined }
  | { readonly files: ScriptFiles; readonly file?: undefined; readonly code?: undefined };
export type OutcomeRow = readonly [name: string, code: CaseSpec, found: readonly string[]];
export type Verdicts = Readonly<Record<string, readonly string[]>>;
type ScriptOptions = { readonly hidden?: readonly string[] };
type UseOptions = ScriptOptions & { readonly enabled: boolean };
type DescribeRules = (name: string, body: () => void) => void;

const rulesReport: (text: string) => readonly RuleEntry[] = JSON.parse;
export type ContextOptions = {
  readonly projectRoot: string;
  readonly liveRoot: string;
  readonly settings: ScriptSettings;
  readonly reportRoot: string;
};

export function toolContext(options: ContextOptions): ToolContext {
  return createToolContext(options);
}

function rawFindingsOf(
  roots: string[],
  files: ScriptFiles,
  {
    settings = {},
    hidden = [],
  }: { settings?: ScriptSettings | undefined; hidden?: readonly string[] },
): RuleEntry[] {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-script-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-report-')));
  roots.push(root, reportRoot);
  writeFiles(root, files);
  const context = toolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['.'], ...settings },
    reportRoot,
  });
  checkRules(context);
  return rulesReport(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8')).filter(
    ({ rule }) => !hidden.includes(rule),
  );
}

function specFiles(spec: CaseSpec): (readonly [string, string])[] {
  if (typeof spec === 'string') {
    return [['mod.py', spec]];
  }
  return spec.files === undefined
    ? [[spec.file ?? 'mod.py', spec.code]]
    : Object.entries(spec.files);
}

function caseFiles(cases: Readonly<Record<string, CaseSpec>>): ScriptFiles {
  return Object.fromEntries(
    Object.values(cases).flatMap((spec, index) =>
      specFiles(spec).map(([file, code]) => [`k${String(index)}/${file}`, code]),
    ),
  );
}

function viaText(via: string | undefined): string {
  return via === undefined ? '' : ` via ${via}`;
}

function verdictsFrom(found: readonly RuleEntry[], names: readonly string[]): Verdicts {
  return Object.fromEntries(
    names.map((name, index) => [
      name,
      found
        .filter(({ path: file }) => file.startsWith(`k${String(index)}/`))
        .map(({ rule, line, subject, via }) => `${rule}:${String(line)} ${subject}${viaText(via)}`),
    ]),
  );
}

export function createScripts({ hidden = [] }: ScriptOptions = {}): {
  cleanup: () => void;
  outcomes: (rows: readonly OutcomeRow[], settings?: ScriptSettings) => [Verdicts, Verdicts];
  findingsOf: (files: ScriptFiles, settings?: ScriptSettings) => string[];
  reportOf: (files: ScriptFiles, settings?: ScriptSettings) => RuleEntry[];
  single: (code: string, file?: string) => string[];
  verdicts: (cases: Readonly<Record<string, CaseSpec>>, settings?: ScriptSettings) => Verdicts;
} {
  const roots: string[] = [];

  function cleanup(): void {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function reportOf(files: ScriptFiles, settings?: ScriptSettings): RuleEntry[] {
    return rawFindingsOf(roots, files, { settings, hidden });
  }

  function findingsOf(files: ScriptFiles, settings?: ScriptSettings): string[] {
    return reportOf(files, settings).map(
      ({ rule, path: file, subject, line, via }) =>
        `${rule} ${file}:${String(line)} ${subject}${viaText(via)}`,
    );
  }

  function verdicts(
    cases: Readonly<Record<string, CaseSpec>>,
    settings?: ScriptSettings,
  ): Verdicts {
    const found = rawFindingsOf(roots, caseFiles(cases), { settings, hidden });
    return verdictsFrom(found, Object.keys(cases));
  }

  function outcomes(rows: readonly OutcomeRow[], settings?: ScriptSettings): [Verdicts, Verdicts] {
    const cases = Object.fromEntries(rows.map(([name, code]) => [name, code]));
    const expected = Object.fromEntries(rows.map(([name, , found]) => [name, found]));
    return [verdicts(cases, settings), expected];
  }

  function single(code: string, file = 'src/mod.py'): string[] {
    return findingsOf({ [file]: code });
  }

  return { cleanup, outcomes, findingsOf, reportOf, single, verdicts };
}

type ItOutcomes = (title: string, rows: readonly OutcomeRow[], settings?: ScriptSettings) => void;

function declareOutcomes(
  outcomes: (rows: readonly OutcomeRow[], settings?: ScriptSettings) => [Verdicts, Verdicts],
): ItOutcomes {
  return (title, rows, settings) => {
    it(title, () => {
      const [actual, expected] = outcomes(rows, settings);
      expect(actual).toEqual(expected);
    });
  };
}

export function inFile(file: string, code: string): { file: string; code: string } {
  return { file, code };
}

export function pythonLines(...lines: string[]): string {
  return `${lines.join('\n')}\n`;
}

function declareRules(enabled: boolean): DescribeRules {
  return (name, body) => {
    describe.skipIf(!enabled)(name, body);
  };
}

export function useScripts({ enabled, ...options }: UseOptions): Omit<
  ReturnType<typeof createScripts>,
  'cleanup'
> & {
  itOutcomes: ItOutcomes;
  describeRules: DescribeRules;
} {
  const { cleanup, ...scripts } = createScripts(options);
  afterEach(cleanup);
  return {
    ...scripts,
    itOutcomes: declareOutcomes(scripts.outcomes),
    describeRules: declareRules(enabled),
  };
}

export function useRuleScripts(
  rules: string | readonly string[],
  options: UseOptions,
): {
  outcomes: (rows: readonly OutcomeRow[], settings?: ScriptSettings) => [Verdicts, Verdicts];
  itOutcomes: ItOutcomes;
  describeRules: DescribeRules;
} {
  const { outcomes: allOutcomes, describeRules } = useScripts(options);
  const prefixes = [rules].flat().map((rule) => `${rule}:`);

  function outcomes(rows: readonly OutcomeRow[], settings?: ScriptSettings): [Verdicts, Verdicts] {
    const [actual, expected] = allOutcomes(rows, settings);
    const own = Object.fromEntries(
      Object.entries(actual).map(([name, found]) => [
        name,
        found.filter((line) => prefixes.some((prefix) => line.startsWith(prefix))),
      ]),
    );
    return [own, expected];
  }

  return { outcomes, itOutcomes: declareOutcomes(outcomes), describeRules };
}

export function ruleLine(rule: string): (line: number, subject: string) => string {
  return (line, subject) => `${rule}:${String(line)} ${subject}`;
}

const RELATION_SCHEMA_RULES = ['unindexed-foreign-key', 'eager-relationship'];

export function useRelationScripts(enabled: boolean): ReturnType<typeof useScripts> {
  return useScripts({ enabled, hidden: RELATION_SCHEMA_RULES });
}
