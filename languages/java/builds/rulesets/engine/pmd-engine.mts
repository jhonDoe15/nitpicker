import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import {
  runEngineSync,
  writtenFile,
  type EngineCall,
  type EngineEnvironment as Environment,
  type EngineHooks,
  type EngineLog,
  type EngineRun,
  type EngineStart,
} from '../../../../../shared/engine/engine-run.mts';
import {
  engineFindingOf,
  type EngineFinding as Row,
} from '../../../../../shared/engine/engine-rows.mts';
import {
  fieldOf,
  listOf,
  parseJson,
  textOf,
  textsOf,
} from '../../../../../shared/values/readers.mts';
import { resolvedRulesets, rulesetReader, type ResolvedRule } from './pmd-catalog.mts';
import { onlyFiles, renderedRuleset, type RulesetScope } from './pmd-render.mts';
import { engineRule, portablePattern, ruleLevel, runsOnEngine, runsOnPmd } from './pmd-rule-parts.mts';

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
type Split = RulesetScope & {
  readonly file: string;
  readonly name: string;
  readonly onEngine: readonly ResolvedRule[];
  readonly onPmd: readonly ResolvedRule[];
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

type Resolve = ReturnType<typeof resolvedRulesets>;
type Unresolved = { readonly unresolved: unknown };

function splitOf(file: string, resolve: Resolve): Split | Unresolved {
  try {
    const { name, include, exclude, rules } = resolve(file);
    return {
      file,
      name,
      include,
      exclude,
      onEngine: rules.filter(runsOnEngine),
      onPmd: rules.filter(runsOnPmd),
    };
  } catch (error) {
    return { unresolved: error };
  }
}

function matchesWhole(pattern: string, file: string): boolean {
  const portable = new RegExp(portablePattern(pattern));
  return new RegExp(`^(?:${portable.source})$`).test(file);
}

function covers({ include, exclude }: RulesetScope, file: string): boolean {
  return (
    !exclude.some((pattern) => matchesWhole(pattern, file)) ||
    include.some((pattern) => matchesWhole(pattern, file))
  );
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
            writtenFile(
              path.join(reportDir, `${base}-coded.xml`),
              renderedRuleset(split.name, split, split.onPmd),
            ),
          ]),
      ...(again.length === 0 || split.onEngine.length === 0
        ? []
        : [
            writtenFile(
              path.join(reportDir, `${base}-unparsed.xml`),
              renderedRuleset(`${split.name}-unparsed`, onlyFiles(again), split.onEngine),
            ),
          ]),
    ];
  });
}

function engineRun(
  plan: PmdEnginePlan,
  splits: readonly Split[],
  { start, log }: { readonly start: () => EngineRun; readonly log: EngineLog | undefined },
): unknown {
  const rules = splits.flatMap((split) => split.onEngine.map((rule) => engineRule(rule, split)));
  if (rules.length === 0 || !existsSync(path.join(plan.javaHome, 'jmods'))) {
    return undefined;
  }
  writeFileSync(path.join(plan.reportDir, ENGINE_RULES), JSON.stringify(rules));
  const { status, stderr } = start();
  if (status !== 0) {
    log?.write(`nitpicker: the engine did not run the PMD rules, PMD runs them: ${stderr}\n`);
    return undefined;
  }
  return parseJson(readFileSync(path.join(plan.reportDir, ENGINE_REPORT), 'utf8'));
}

function engineStart(plan: PmdEnginePlan, { binary, environment, run }: EngineCall): EngineRun {
  return run(
    [
      ...plan.sources,
      ...['--rules', XPATH_RULE_KIND, '--classpath', plan.auxClasspath],
      ...['--out', path.join(plan.reportDir, ENGINE_REPORT)],
    ],
    {
      binary,
      environment: {
        ...environment,
        NP_XPATH_RULES: path.join(plan.reportDir, ENGINE_RULES),
        NP_SUPPRESS_MARKER: plan.suppressMarker,
        NITPICKER_JDK: plan.javaHome,
      },
    },
  );
}

function engineSplits(plan: PmdEnginePlan): Map<string, Split> {
  const resolve = resolvedRulesets(rulesetReader(plan.pmdJar));
  return new Map(
    plan.rulesets
      .filter((file) => !plan.untouched.includes(file))
      .flatMap((file) => {
        const split = splitOf(file, resolve);
        return 'unresolved' in split ? [] : [[file, split] as const];
      }),
  );
}

function isCrashed(row: Row): boolean {
  return row.rule.startsWith(CRASHED_RULE);
}

function writeEngineReports(
  reportDir: string,
  rows: readonly Row[],
  splits: ReadonlyMap<string, Split>,
): void {
  const levels = new Map(
    [...splits.values()].flatMap(({ onEngine }) =>
      onEngine.map((rule) => [rule.name, ruleLevel(rule)] as const),
    ),
  );
  writeFileSync(
    path.join(reportDir, ENGINE_SARIF),
    sarifOf(
      rows.filter((row) => !isCrashed(row)),
      levels,
    ),
  );
  writeFileSync(path.join(reportDir, ENGINE_LOG), crashLog(rows.filter(isCrashed)));
}

export function withoutEngineReports(reportDir: string): void {
  for (const name of [ENGINE_SARIF, ENGINE_LOG, ENGINE_REPORT]) {
    rmSync(path.join(reportDir, name), { force: true });
  }
}

function rulesetsAfterEngine(
  plan: PmdEnginePlan,
  environment: Environment,
  { run, log }: { readonly run: EngineStart; readonly log: EngineLog | undefined },
): string[] {
  const binary = findEngine(environment);
  if (binary === undefined) {
    return [...plan.rulesets];
  }
  const splits = engineSplits(plan);
  const report = engineRun(plan, [...splits.values()], {
    start: () => engineStart(plan, { binary, environment, run }),
    log,
  });
  if (report === undefined) {
    return [...plan.rulesets];
  }
  const unparsed = textsOf(fieldOf(report, 'syntaxErrorFiles'));
  const forPmd = pmdRulesets(plan, splits, unparsed);
  if (forPmd.length === 0) {
    return [...plan.rulesets];
  }
  const rows = listOf(fieldOf(report, 'findings'))
    .map(engineFindingOf)
    .filter(({ file }) => !unparsed.includes(file));
  writeEngineReports(plan.reportDir, rows, splits);
  return forPmd;
}

export function pmdRulesetsWithEngine(
  plan: PmdEnginePlan,
  environment: Environment,
  { run = (argumentList, options) => runEngineSync(argumentList, options), log }: EngineHooks = {},
): string[] {
  withoutEngineReports(plan.reportDir);
  try {
    return rulesetsAfterEngine(plan, environment, { run, log });
  } catch (error) {
    withoutEngineReports(plan.reportDir);
    const reason = error instanceof Error ? error.message : String(error);
    log?.write(`nitpicker: the engine did not run the PMD rules, PMD runs them: ${reason}\n`);
    return [...plan.rulesets];
  }
}
