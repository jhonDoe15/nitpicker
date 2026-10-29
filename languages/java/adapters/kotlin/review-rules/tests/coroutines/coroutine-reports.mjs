import { FIXED_SLEEP_RULE } from '../../../../../messages/wait-advice.mjs';
import { classesOf, enclosingClasses } from '../discovery/declarations.mjs';
import { functionsOf } from '../discovery/functions.mjs';
import { hasNestedRegistration } from '../discovery/kotest/kotest-specs.mjs';
import { testBodies } from '../discovery/test-units.mjs';
import { delayNames, suiteFlags } from '../project-flags.mjs';
import { contextDeclarations } from './delays/dispatchers.mjs';
import { delayPattern, REAL_DELAY_MESSAGE, realDelays } from './delays/real-delays.mjs';
import { declaredScopes, globalScopeAliases, scopeFactories } from './escapes/escape-scopes.mjs';
import { ESCAPING_MESSAGE, ESCAPING_RULE, escapingLaunches } from './escapes/escaping-launches.mjs';
import { syncNames, teardownFor } from './escapes/escape-waits.mjs';

function report(unit, entry, { rule, message, key }) {
  return { rule, offset: entry.offset, symbol: unit.symbol, key, message };
}

function insideAnyTest(tests, offset) {
  return tests.some(({ body }) => body.start <= offset && offset < body.end);
}

function helperUnits(scanned, tests) {
  const classes = classesOf(scanned);
  const testFunctions = new Set(tests.map(({ offset }) => offset));
  return functionsOf(scanned)
    .filter((fn) => !testFunctions.has(fn.offset) && !insideAnyTest(tests, fn.offset))
    .filter((fn) => !hasNestedRegistration(scanned, fn.body))
    .map((fn) => {
      const chain = enclosingClasses(classes, fn.offset);
      return {
        framework: 'helper',
        symbol: [...chain.map(({ name }) => name), fn.name].join('.'),
        body: fn.body,
        configs: [],
        owner:
          chain.length === 0 ? undefined : { klass: chain.at(-1), ancestors: chain.slice(0, -1) },
      };
    });
}

function fileContext(scanned, project) {
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

function suiteContext({ scanned, base, project }, suite) {
  const flags = { ...project, ...suiteFlags(project, scanned, suite) };
  const context = { ...base, project: flags };
  return {
    ...context,
    scopes: declaredScopes(base.code, context),
    teardown: teardownFor(scanned, suite),
  };
}

function testReports(file, suites) {
  const contexts = new Map(suites.map((suite) => [suite.klass, suiteContext(file, suite)]));
  return testBodies(file.scanned, suites).flatMap((unit) => {
    const context = { ...contexts.get(unit.suite.klass), unit };
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

export function coroutineReports(scanned, suites, project) {
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
