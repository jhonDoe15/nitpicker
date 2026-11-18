import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPENDENCY_RULES as untypedDependencyRules } from '../../../../shared/exceptions/rule-tools.mjs';
import untypedCruiserConfig from '../defaults/dependency-cruiser.config.mjs';
import { fieldOf, listOf, parseJson, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { NO_IMPORT_OUTSIDE_ROOTS } from './outside-roots/outside-roots.mjs';
import {
  cruiseStrict,
  cruiseWithConfig,
  type FixtureConfig,
  outputText,
} from './test-support/strict-cruise.mts';
import untypedStrictConfig from './fixtures/dependency-cruiser.strict.fixture.config.mjs';
import {
  REACH_THROUGH_SHARED_RULE,
  sharedReachPath as untypedSharedReachPath,
  strictBoundaryRules as untypedStrictBoundaryRules,
  strictBoundaryRulesFor as untypedStrictBoundaryRulesFor,
} from './strict-boundary-rules.mjs';
import {
  testFilePathPatterns as untypedTestFilePathPatterns,
  testFilePaths as untypedTestFilePaths,
} from './strict-layout.mjs';
import { resolveLayout } from '../layout.mjs';
import {
  defaultTestFiles as untypedDefaultTestFiles,
  testFilePatterns as untypedTestFilePatterns,
} from '../test-runner/test-files/test-file-patterns.mjs';

type StrictRule = {
  readonly name: string;
  readonly comment: string;
  readonly from: { readonly pathNot?: readonly string[] };
  readonly to: { readonly path: string | readonly string[] };
};

type Exception = {
  readonly rule: string;
  readonly paths: readonly string[];
  readonly reason: string;
};

const strictBoundaryRules: readonly StrictRule[] = untypedStrictBoundaryRules;
const strictBoundaryRulesFor: (exceptions: readonly Exception[]) => readonly StrictRule[] =
  untypedStrictBoundaryRulesFor;
const sharedReachPath: (violation: unknown, modules: unknown) => string[] | undefined =
  untypedSharedReachPath;
const cruiserConfig: { readonly forbidden: readonly { readonly name: string }[] } =
  untypedCruiserConfig;
const DEPENDENCY_RULES: readonly string[] = untypedDependencyRules;
const strictConfig: FixtureConfig = untypedStrictConfig;
const testFilePaths: readonly string[] = untypedTestFilePaths;
const testFilePathPatterns: (layout: unknown, projectRoot: string) => unknown =
  untypedTestFilePathPatterns;
const defaultTestFiles: (runner: string) => unknown = untypedDefaultTestFiles;
function testFilePatterns(options: { includeRegexes: string[] }): unknown {
  return Reflect.apply(untypedTestFilePatterns, undefined, [options]);
}

const fixturesRoot = path.resolve(import.meta.dirname, 'fixtures/strict');

function cruiseFixture(name: string, outputType: 'err-long' | 'json' = 'err-long') {
  return cruiseStrict({
    baseDir: path.join(fixturesRoot, name),
    paths: ['src'],
    outputType,
  });
}

const violations: [string, string, string | undefined][] = [
  [
    'internal-import-from-feature',
    'features-do-not-import-other-feature-internals',
    'public index.ts',
  ],
  ['internal-import-from-shared', 'feature-internals-only-through-index', 'public index.ts'],
  [
    'shared-imports-feature',
    'shared-does-not-import-features',
    'parameter from the composition root',
  ],
  ['feature-imports-composition-root', 'features-do-not-import-composition-root', 'as a parameter'],
  ['domain-imports-adapters', 'domain-does-not-import-adapters', 'adapters/ implement it'],
  ['domain-imports-node-io', 'domain-does-not-import-node-io', 'only pure Node modules'],
  ['domain-imports-client', 'domain-does-not-import-network-or-database-clients', 'from adapters/'],
  ['domain-imports-logger', 'domain-does-not-import-the-logger', 'adapters/ log it'],
  [
    'domain-imports-state',
    'domain-does-not-import-module-state',
    'Receive the state as a parameter',
  ],
  ['domain-imports-id-library', 'domain-does-not-import-id-libraries', 'as a parameter'],
  [
    'domain-reaches-io-through-shared',
    'domain-does-not-reach-io-through-shared',
    'Move that dependency out of the shared module',
  ],
  ['import-cycle', 'no-production-cycles', undefined],
];

const exceptionRoute = 'An exception fits only when it is deliberate';

describe('strict boundary rules', () => {
  it('accepts the allowed layout', async () => {
    const result = await cruiseFixture('allowed');

    expect(result.exitCode, outputText(result)).toBe(0);
  });

  it('accepts pure Node subpaths in domain/', async () => {
    const result = await cruiseFixture('domain-imports-pure-subpath');

    expect(result.exitCode, outputText(result)).toBe(0);
  });

  it('names the exception route in every domain rule', () => {
    const domainRules = strictBoundaryRules.filter(({ name }) => name.startsWith('domain-'));

    expect(domainRules.length).toBeGreaterThan(5);
    expect(domainRules.filter(({ comment }) => !comment.includes(exceptionRoute))).toEqual([]);
  });

  it('lifts a rule for the importing files an exception names', () => {
    const rule = (exceptions: readonly Exception[]) =>
      strictBoundaryRulesFor(exceptions).find(
        ({ name }) => name === 'domain-does-not-import-node-io',
      );

    expect(rule([])?.from.pathNot).toEqual(testFilePaths);
    expect(
      rule([
        { rule: 'domain-does-not-import-node-io', paths: ['src/legacy/**'], reason: 'old' },
        { rule: 'other-rule', paths: ['src/other/**'], reason: 'unrelated' },
      ])?.from.pathNot,
    ).toEqual([...testFilePaths, '^(?:src/legacy/.*)$']);
  });

  it('defines every strict rule the fixtures exercise', () => {
    expect([...new Set(strictBoundaryRules.map(({ name }) => name))].sort()).toEqual([
      'domain-does-not-import-adapters',
      'domain-does-not-import-id-libraries',
      'domain-does-not-import-module-state',
      'domain-does-not-import-network-or-database-clients',
      'domain-does-not-import-node-io',
      'domain-does-not-import-the-logger',
      'domain-does-not-reach-io-through-shared',
      'feature-internals-only-through-index',
      'features-do-not-import-composition-root',
      'features-do-not-import-other-feature-internals',
      'shared-does-not-import-features',
    ]);
  });

  it.each(violations)('rejects %s', async (fixture, rule, allowedForm) => {
    const result = await cruiseFixture(fixture);
    const output = outputText(result).replaceAll(/\s+/g, ' ');

    expect(result.exitCode).not.toBe(0);
    expect(output).toContain(rule);
    expect(output).toContain(allowedForm ?? '');
  });
});

describe('npm package patterns in the domain rules', () => {
  const packageRules = [
    ['domain-does-not-import-network-or-database-clients', 'pg'],
    ['domain-does-not-import-the-logger', 'pino'],
    ['domain-does-not-import-id-libraries', 'uuid'],
    ['domain-does-not-reach-io-through-shared', 'pg'],
  ];

  function matches(ruleName: string, target: string) {
    const rule = strictBoundaryRules.find(({ name }) => name === ruleName);
    return [rule?.to.path ?? []].flat().some((pattern) => new RegExp(pattern).test(target));
  }

  it.each(packageRules)('%s matches %s unresolved, installed and under pnpm', (ruleName, name) => {
    expect(
      [
        name,
        `node_modules/${name}/lib/index.js`,
        `node_modules/.pnpm/${name}@8.11.0/node_modules/${name}/lib/index.js`,
      ].map((target) => matches(ruleName, target)),
    ).toEqual([true, true, true]);
  });

  it.each(packageRules)('%s does not match a local folder named %s', (ruleName, name) => {
    expect(
      [`src/main/shared/${name}/frames.ts`, `src/${name}/x.ts`].map((target) =>
        matches(ruleName, target),
      ),
    ).toEqual([false, false]);
  });
});

describe('the shared module a domain file reaches I/O through', () => {
  async function reachPaths(name: string) {
    const report: unknown = JSON.parse(outputText(await cruiseFixture(name, 'json')));
    return listOf(fieldOf(fieldOf(report, 'summary'), 'violations'))
      .filter(
        (violation) => fieldOf(fieldOf(violation, 'rule'), 'name') === REACH_THROUGH_SHARED_RULE,
      )
      .map((violation) => [
        fieldOf(violation, 'from'),
        sharedReachPath(violation, fieldOf(report, 'modules')),
      ]);
  }

  it('names the shared module and the I/O module it reaches', async () => {
    expect(await reachPaths('domain-reaches-io-through-shared')).toEqual([
      ['src/main/features/auth/domain/login.ts', ['src/main/shared/clock.ts', 'fs']],
    ]);
  });

  it('reaches nothing through a type-only import, a direct import or another domain file', async () => {
    const paths = await reachPaths('domain-reaches-io-only-directly');

    expect(
      paths.map(([from]) => textOf(from)).toSorted((left, right) => left.localeCompare(right)),
    ).toEqual([
      'src/main/features/calc/domain/direct.ts',
      'src/main/features/calc/domain/typed.ts',
      'src/main/features/calc/domain/user.ts',
    ]);
    expect(paths.map(([, via]) => via)).toEqual([undefined, undefined, undefined]);
  });
});

describe('the test files of each runner in domain/', () => {
  const fixture = path.join(fixturesRoot, 'domain-runner-tests');
  const domain = 'src/main/features/auth/domain';
  const BASE_PATTERNS = [
    '^(?:test|tests|__tests__|e2e)/',
    '(?:^|/)(?:src)/.*/__tests__/',
    '(?:^|/)(?:src)/.*\\.(?:test|spec)\\.',
  ];

  function patternsFor(testFiles: unknown): string[] {
    const layout: unknown = resolveLayout({}, [], { testFiles });
    const patterns: unknown = testFilePathPatterns(layout, fixture);
    return textsOf(patterns);
  }

  function cruiseWith(patterns: readonly string[]) {
    const forbidden = strictConfig.forbidden.map((rule) =>
      rule.name?.startsWith('domain-') === true
        ? { ...rule, from: { ...rule.from, pathNot: [...patterns] } }
        : rule,
    );
    return cruiseWithConfig(
      { ...strictConfig, forbidden },
      { baseDir: fixture, paths: ['src'], outputType: 'json' },
    );
  }

  it('names the colocated node:test files by path', () => {
    expect(patternsFor(defaultTestFiles('node'))).toEqual([
      ...BASE_PATTERNS,
      '(?:^|/)src/main/features/auth/domain/login-test\\.ts$',
      '(?:^|/)src/main/features/auth/domain/test/login\\.ts$',
    ]);
  });

  it('names the files a Jest test regex matches by path', () => {
    const testFiles = testFilePatterns({ includeRegexes: ['-test\\.ts$'] });

    expect(patternsFor(testFiles)).toEqual([
      ...BASE_PATTERNS,
      '(?:^|/)src/main/features/auth/domain/login-test\\.ts$',
    ]);
  });

  it.each(['vitest', 'mocha'])('keeps only the shared test paths for %s', (runner: string) => {
    expect(patternsFor(defaultTestFiles(runner))).toEqual(BASE_PATTERNS);
  });

  async function violationsWith(patterns: readonly string[]): Promise<string[][]> {
    const report = parseJson(outputText(await cruiseWith(patterns)));
    return listOf(fieldOf(fieldOf(report, 'summary'), 'violations'))
      .map((violation) => [
        textOf(fieldOf(violation, 'from')),
        textOf(fieldOf(violation, 'to')),
        textOf(fieldOf(fieldOf(violation, 'rule'), 'name')),
      ])
      .toSorted((left, right) => left.join(',').localeCompare(right.join(',')));
  }

  it('leaves the node:test files out of the domain rules', async () => {
    expect(await violationsWith(patternsFor(defaultTestFiles('node')))).toEqual([]);
  });

  it('holds the same files to the domain rules when the runner does not run them', async () => {
    expect(await violationsWith(patternsFor(defaultTestFiles('vitest')))).toEqual([
      [`${domain}/login-test.ts`, 'fs', 'domain-does-not-import-node-io'],
      [`${domain}/login-test.ts`, 'fs', REACH_THROUGH_SHARED_RULE],
      [`${domain}/login-test.ts`, 'node:test', 'domain-does-not-import-node-io'],
      [`${domain}/test/login.ts`, 'node:test', 'domain-does-not-import-node-io'],
    ]);
  });
});

describe('the exception route of the dependency rules', () => {
  it('knows every dependency-cruiser rule except the one a layout setting lifts', () => {
    const names = cruiserConfig.forbidden.map(({ name }) => name);

    expect(names.filter((name) => name !== NO_IMPORT_OUTSIDE_ROOTS).toSorted()).toEqual(
      DEPENDENCY_RULES.toSorted(),
    );
  });
});
