import type { ClassInfo, Suite, TestNode, TestScanned } from '../typed/discovery-types.mts';
import type { ProjectFlags, Report } from '../typed/report-types.mts';
import type { FileContext, SuiteContext, Unit } from '../typed/rule-types.mts';
import { FIXED_SLEEP_RULE } from '../../../../../messages/wait-advice.mts';
import { classesOf, enclosingClasses } from '../discovery/declarations.mts';
import { functionsOf } from '../discovery/functions.mts';
import { hasNestedRegistration } from '../discovery/kotest/kotest-specs.mts';
import { testBodies } from '../discovery/test-units.mts';
import { delayNames, suiteFlags } from '../project-flags.mts';
import { contextDeclarations } from './delays/dispatchers.mts';
import { delayPattern, REAL_DELAY_MESSAGE, realDelays } from './delays/real-delays.mts';
import { declaredScopes, globalScopeAliases, scopeFactories } from './escapes/escape-scopes.mts';
import { ESCAPING_MESSAGE, ESCAPING_RULE, escapingLaunches } from './escapes/escaping-launches.mts';
import { syncNames, teardownFor } from './escapes/escape-waits.mts';

function report(
  unit: { symbol: string },
  entry: { offset: number },
  { rule, message, key }: { rule: string; message: string; key: string },
): Report {
  return { rule, offset: entry.offset, symbol: unit.symbol, key, message };
}

function insideAnyTest(tests: TestNode[], offset: number): boolean {
  return tests.some(({ body }) => body.start <= offset && offset < body.end);
}

function helperUnits(scanned: TestScanned, tests: TestNode[]): Unit[] {
  const classes = classesOf(scanned);
  const testFunctions = new Set(tests.map(({ offset }) => offset));
  return functionsOf(scanned)
    .filter((fn) => !(testFunctions.has(fn.offset) || insideAnyTest(tests, fn.offset)))
    .filter((fn) => !hasNestedRegistration(scanned, fn.body))
    .map((fn): Unit => {
      const chain = enclosingClasses(classes, fn.offset);
      const klass = chain.at(-1);
      return {
        framework: 'helper',
        symbol: [...chain.map(({ name }) => name), fn.name].join('.'),
        body: fn.body,
        configs: [],
        owner: klass === undefined ? undefined : { klass, ancestors: chain.slice(0, -1) },
      };
    });
}

function fileContext(scanned: TestScanned, project: ProjectFlags): FileContext {
  const { code } = scanned;
  return {
    code,
    tables: scanned.tables,
    declarations: contextDeclarations(code),
    aliases: globalScopeAliases(scanned),
    factories: scopeFactories(scanned),
    syncs: syncNames(code),
    pattern: delayPattern(delayNames(scanned, project)),
  };
}

function suiteContext(
  { scanned, base, project }: { scanned: TestScanned; base: FileContext; project: ProjectFlags },
  suite: Suite,
): SuiteContext {
  const flags = { ...project, ...suiteFlags(project, scanned, suite) };
  const context = { ...base, project: flags };
  return {
    ...context,
    scopes: declaredScopes(base.code, context),
    teardown: teardownFor(scanned, suite),
  };
}

function testReports(
  file: { scanned: TestScanned; base: FileContext; project: ProjectFlags },
  suites: Suite[],
): Report[] {
  const contexts = new Map(
    suites.map((suite): [ClassInfo, SuiteContext] => [suite.klass, suiteContext(file, suite)]),
  );
  return testBodies(file.scanned, suites).flatMap((unit) => {
    const suiteContexts = contexts.get(unit.suite.klass);
    if (suiteContexts === undefined) {
      return [];
    }
    const context = { ...suiteContexts, unit };
    return [
      ...escapingLaunches(context).map((entry) =>
        report(unit, entry, {
          rule: ESCAPING_RULE,
          message: ESCAPING_MESSAGE,
          key: `${unit.symbol}:${entry.builder}`,
        }),
      ),
      ...realDelays(context).map((entry) =>
        report(unit, entry, {
          rule: FIXED_SLEEP_RULE,
          message: REAL_DELAY_MESSAGE,
          key: `${unit.symbol}:delay:real-dispatcher`,
        }),
      ),
    ];
  });
}

export function coroutineReports(
  scanned: TestScanned,
  suites: Suite[],
  project: ProjectFlags,
): Report[] {
  const base = fileContext(scanned, project);
  const tests = suites.flatMap(({ nodes }) => nodes);
  const helpers = helperUnits(scanned, tests).flatMap((unit) => {
    const flags =
      unit.owner === undefined ? { mainReplaced: false } : suiteFlags(project, scanned, unit.owner);
    return realDelays({ ...base, project: { ...project, ...flags }, unit }).map((entry) =>
      report(unit, entry, {
        rule: FIXED_SLEEP_RULE,
        message: REAL_DELAY_MESSAGE,
        key: `${unit.symbol}:delay:real-dispatcher`,
      }),
    );
  });
  return [...testReports({ scanned, base, project }, suites), ...helpers];
}
