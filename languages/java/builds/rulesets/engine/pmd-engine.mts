import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { runEngineSync, type EngineRun } from '../../../../../shared/engine/engine-run.mts';
import {
  fieldOf,
  listOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';
import { resolvedRulesets, rulesetReader, type ResolvedRule } from './pmd-catalog.mts';
import { onlyFiles, renderedRuleset, type RulesetScope } from './pmd-render.mts';
import { engineRule, portablePattern, ruleLevel, runsOnEngine } from './pmd-rule-parts.mts';

export type PmdEnginePlan = {
  readonly reportDir: string;
  readonly rulesets: readonly string[];
  readonly untouched: readonly string[];
  readonly sources: readonly string[];
  readonly auxClasspath: string;
  readonly pmdJar: string;
  readonly javaHome: string;
  readonly suppressMarker: string;
};
type Environment = Readonly<Record<string, string | undefined>>;
type EngineStart = (
  argumentList: readonly string[],
  options: { readonly binary: string; readonly environment: Environment },
) => EngineRun;
type Split = RulesetScope & {
  readonly file: string;
  readonly name: string;
  readonly onEngine: readonly ResolvedRule[];
  readonly onPmd: readonly ResolvedRule[];
};
type Row = {
  readonly file: string;
  readonly rule: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
};

export const ENGINE_SARIF = 'pmd-engine.sarif';
export const ENGINE_LOG = 'pmd-engine-log.txt';
const ENGINE_RULES = 'pmd-engine-rules.json';
const ENGINE_REPORT = 'pmd-engine-report.json';
const CRASHED_RULE = '!';
const XPATH_RULE_KIND = '_XPath';

export function enginePlanOf(
  plan: unknown,
  reportDir: string,
  guards: readonly string[],
): PmdEnginePlan | undefined {
  if (plan === undefined) {
    return undefined;
  }
  return {
    reportDir,
    rulesets: [...textsOf(fieldOf(plan, 'rulesets')), ...guards],
    untouched: textsOf(fieldOf(plan, 'untouched')),
    sources: textsOf(fieldOf(plan, 'sources')),
    auxClasspath: textOf(fieldOf(plan, 'auxClasspath')),
    pmdJar: textOf(fieldOf(plan, 'pmdJar')),
    javaHome: textOf(fieldOf(plan, 'javaHome')),
    suppressMarker: textOf(fieldOf(plan, 'suppressMarker')),
  };
}

function splitOf(file: string, resolve: ReturnType<typeof resolvedRulesets>): Split | undefined {
  try {
    const { name, include, exclude, rules } = resolve(file);
    return {
      file,
      name,
      include,
      exclude,
      onEngine: rules.filter(runsOnEngine),
      onPmd: rules.filter((rule) => !runsOnEngine(rule)),
    };
  } catch {
    return undefined;
  }
}

function covers({ include, exclude }: RulesetScope, file: string): boolean {
  const matches = (pattern: string): boolean =>
    new RegExp(`^(?:${portablePattern(pattern)})$`).test(file);
  return !exclude.some(matches) || include.some(matches);
}

function rowOf(finding: unknown): Row {
  return {
    file: String(fieldOf(finding, 'file')),
    rule: String(fieldOf(finding, 'rule')),
    line: Number(fieldOf(finding, 'line')),
    column: Number(fieldOf(finding, 'column')),
    message: String(fieldOf(finding, 'message')),
  };
}

function sarifOf(rows: readonly Row[], levels: ReadonlyMap<string, string>): string {
  const results = rows.map(({ file, rule, line, column, message }) => ({
    ruleId: rule,
    message: { text: message },
    level: levels.get(rule) ?? 'warning',
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: pathToFileURL(file).href },
          region: { startLine: line, startColumn: column },
        },
      },
    ],
  }));
  return JSON.stringify({
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'PMD', rules: [] } }, results }],
  });
}

function crashLog(rows: readonly Row[]): string {
  return rows
    .map(
      ({ rule, file }) =>
        `Exception applying rule ${rule.slice(CRASHED_RULE.length)} on file ${file}, continuing with next rule\n`,
    )
    .join('');
}

function written(directory: string, name: string, text: string): string {
  const file = path.join(directory, name);
  writeFileSync(file, text);
  return file;
}

function pmdRulesets(
  { reportDir, rulesets }: PmdEnginePlan,
  splits: ReadonlyMap<string, Split>,
  unparsed: readonly string[],
): string[] {
  return rulesets.flatMap((file, index) => {
    const split = splits.get(file);
    if (split === undefined) {
      return [file];
    }
    const base = `pmd-${String(index)}`;
    const again = unparsed.filter((source) => covers(split, source));
    return [
      ...(split.onPmd.length === 0
        ? []
        : [
            written(
              reportDir,
              `${base}-coded.xml`,
              renderedRuleset(split.name, split, split.onPmd),
            ),
          ]),
      ...(again.length === 0 || split.onEngine.length === 0
        ? []
        : [
            written(
              reportDir,
              `${base}-unparsed.xml`,
              renderedRuleset(`${split.name}-unparsed`, onlyFiles(again), split.onEngine),
            ),
          ]),
    ];
  });
}

function engineRun(plan: PmdEnginePlan, splits: readonly Split[], start: () => EngineRun): unknown {
  const rules = splits.flatMap((split) => split.onEngine.map((rule) => engineRule(rule, split)));
  if (rules.length === 0 || !existsSync(path.join(plan.javaHome, 'jmods'))) {
    return undefined;
  }
  writeFileSync(path.join(plan.reportDir, ENGINE_RULES), JSON.stringify(rules));
  const { status, stderr } = start();
  if (status !== 0) {
    process.stderr.write(
      `nitpicker: the engine did not run the PMD rules, PMD runs them: ${stderr}\n`,
    );
    return undefined;
  }
  return parseJson(readFileSync(path.join(plan.reportDir, ENGINE_REPORT), 'utf8'));
}

export function withoutEngineReports(reportDir: string): void {
  for (const name of [ENGINE_SARIF, ENGINE_LOG, ENGINE_REPORT]) {
    rmSync(path.join(reportDir, name), { force: true });
  }
}

function rulesetsAfterEngine(
  plan: PmdEnginePlan,
  environment: Environment,
  run: EngineStart,
): string[] {
  const { reportDir, rulesets, untouched, sources } = plan;
  const binary = findEngine(environment);
  if (binary === undefined) {
    return [...rulesets];
  }
  const resolve = resolvedRulesets(rulesetReader(plan.pmdJar));
  const splits = new Map(
    rulesets
      .filter((file) => !untouched.includes(file))
      .flatMap((file) => {
        const split = splitOf(file, resolve);
        return split === undefined ? [] : [[file, split] as const];
      }),
  );
  const report = engineRun(plan, [...splits.values()], () =>
    run(
      [
        ...sources,
        '--rules',
        XPATH_RULE_KIND,
        '--classpath',
        plan.auxClasspath,
        '--out',
        path.join(reportDir, ENGINE_REPORT),
      ],
      {
        binary,
        environment: {
          ...environment,
          NP_XPATH_RULES: path.join(reportDir, ENGINE_RULES),
          NP_SUPPRESS_MARKER: plan.suppressMarker,
          NITPICKER_JDK: plan.javaHome,
        },
      },
    ),
  );
  if (report === undefined) {
    return [...rulesets];
  }
  const unparsed = textsOf(fieldOf(report, 'syntaxErrorFiles'));
  const forPmd = pmdRulesets(plan, splits, unparsed);
  if (forPmd.length === 0) {
    return [...rulesets];
  }
  const rows = listOf(fieldOf(report, 'findings'))
    .map(rowOf)
    .filter(({ file }) => !unparsed.includes(file));
  const levels = new Map(
    [...splits.values()].flatMap(({ onEngine }) =>
      onEngine.map((rule) => [rule.name, ruleLevel(rule)] as const),
    ),
  );
  const crashed = (row: Row): boolean => row.rule.startsWith(CRASHED_RULE);
  writeFileSync(
    path.join(reportDir, ENGINE_SARIF),
    sarifOf(
      rows.filter((row) => !crashed(row)),
      levels,
    ),
  );
  writeFileSync(path.join(reportDir, ENGINE_LOG), crashLog(rows.filter(crashed)));
  return forPmd;
}

export function pmdRulesetsWithEngine(
  plan: PmdEnginePlan,
  environment: Environment,
  run: EngineStart = (argumentList, options) => runEngineSync(argumentList, options),
): string[] {
  withoutEngineReports(plan.reportDir);
  try {
    return rulesetsAfterEngine(plan, environment, run);
  } catch (error) {
    withoutEngineReports(plan.reportDir);
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `nitpicker: the engine did not run the PMD rules, PMD runs them: ${reason}\n`,
    );
    return [...plan.rulesets];
  }
}
