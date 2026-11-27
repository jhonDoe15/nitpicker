import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_PLUGIN_RULES, PLUGIN_RULE_PREFIX } from './engine-rules.mts';
import { engineSettings } from './engine-requests.mts';

const root = process.cwd();
const project = { root, environment: {} };

function settingsOf(
  rules: Readonly<Record<string, unknown>>,
  filename = `${root}/src/a.ts`,
): string[] {
  return engineSettings({ rules, filename, chosen: new Set(Object.keys(rules)), project });
}

function condition(rule: string, kind: string): (value: string, filename: string) => boolean {
  const found = ENGINE_PLUGIN_RULES.get(rule)?.conditions?.[kind];
  if (found === undefined) {
    throw new Error(`${rule} has no ${kind} condition`);
  }
  return found;
}

describe('facts the engine rules get from the project', () => {
  it('gives the defaults when a rule has no options', () => {
    const rules = Object.fromEntries(
      [...ENGINE_PLUGIN_RULES]
        .filter(([, rule]) => rule.facts !== undefined)
        .map(([name]) => [`${PLUGIN_RULE_PREFIX}${name}`, 'error']),
    );

    expect(settingsOf(rules)).toEqual([
      'cognitive-complexity.max=15',
      'contract-infrastructure-type.feature=',
      'no-assertion-in-loop.assertion-function-names=[]',
      `no-copied-constant.root=${root}`,
      'no-copy-pasted-tests.each-case=give each case its own test with it.each',
      'no-git-repository-per-test.shared-setup-hook=beforeAll',
      'no-interval-polling-in-tests.poll-instead=vi.waitFor / expect.poll',
      'no-interval-polling-in-tests.fixture=false',
      ...[
        'no-io-in-loop',
        'no-lookup-per-element',
        'no-remote-call-in-transaction',
        'no-remote-call-under-lock',
        'no-retry-without-idempotency',
        'no-dual-write',
        'no-stale-retry-after-conflict',
        'no-unisolated-job-loop',
      ].map((name) =>
        expect.stringMatching(new RegExp(`^${name}\\.test-sources=.+test-sources\\.tsv$`, 'u')),
      ),
      'no-production-console.streams-allowed=false',
      'no-server-or-worker-per-test.shared-setup-hook=beforeAll',
      'no-test-helpers-in-source.path=src/a.ts',
      'no-test-helpers-in-source.colocated=false',
      'no-test-helpers-in-source.test-root=test',
      'no-unhandled-void-promise.runners=[]',
      'no-unfiltered-soft-delete-read.orms=[]',
      'no-unfiltered-soft-delete-read.filters=[]',
      'no-unknown-in-domain.jsdoc=false',
      expect.stringMatching(/^no-unknown-in-domain\.phrase=./u),
      'no-unsafe-deserialization.yaml-major=',
      'no-untrimmed-request-text.global-trimmer=false',
      'no-route-without-auth.entries=[]',
      'no-sql-string-building.sql-library=',
      'preserve-error-cause.options={}',
      'require-http-timeout.fetch=',
      'require-http-timeout.node-fetch-timeout=',
      'require-http-timeout.project-defaults=',
      'report-module-load-effects.common-js-exports=false',
      expect.stringMatching(/^structured-catch-logging\.logger-shapes=/u),
      expect.stringMatching(/^test-must-use-production-runtime\.exempt=(?:true|false)$/u),
      expect.stringMatching(/^test-must-use-production-runtime\.helper-file=./u),
      'integration-test-uses-approved-harness.integration=false',
      'integration-test-uses-approved-harness.approved-functions=null',
      'integration-test-uses-approved-harness.approved-subprocesses=null',
      'no-first-test-charged-setup.shared-setup-hook=beforeAll',
      'no-fixed-sleep-synchronization.wait-on-condition=vi.waitFor or expect.poll',
      'no-fixed-sleep-synchronization.advance-fake-time=vi.advanceTimersByTime',
      'no-fixed-sleep-synchronization.fixture=false',
      'no-partial-output-assertion.whole-output=`toEqual` or `toBe`',
      expect.stringMatching(/^no-partial-output-assertion\.fragment-forms=`toContain`/u),
      'no-partial-output-assertion.whole-value=`toEqual`',
      expect.stringMatching(/^no-partial-output-assertion\.partial-forms=`toMatchObject`/u),
      'no-partial-output-assertion.varied-field=Use `expect.any(Type)` for a field that varies.',
    ]);
  });

  it('passes the rule options on', () => {
    const rules = {
      'nitpicker/no-test-helpers-in-source': ['error', { testRoot: 'spec', colocated: true }],
      'nitpicker/no-production-console': ['error', { allowStandardStreams: true }],
      'nitpicker/no-assertion-in-loop': ['error', { assertionFunctionNames: ['check'] }],
      'nitpicker/preserve-error-cause': ['error', { wrap: true }],
      'nitpicker/no-unhandled-void-promise': ['error', { runners: ['vitest'] }],
      'nitpicker/report-module-load-effects': ['error', { commonJsExports: true }],
      'nitpicker/no-unsafe-deserialization': ['error', { yamlMajor: 3 }],
      'nitpicker/no-route-without-auth': ['error', { entries: ['route__requireAuth'] }],
      'nitpicker/no-sql-string-building': ['error', { sqlLibrary: 'kysely' }],
      'nitpicker/require-http-timeout': [
        'error',
        { fetch: false, nodeFetchTimeout: false, projectDefaults: ['axios', 'got'] },
      ],
    };

    expect(settingsOf(rules)).toEqual([
      'no-test-helpers-in-source.path=src/a.ts',
      'no-test-helpers-in-source.colocated=true',
      'no-test-helpers-in-source.test-root=spec',
      'no-production-console.streams-allowed=true',
      'no-assertion-in-loop.assertion-function-names=["check"]',
      'preserve-error-cause.options={"wrap":true}',
      'no-unhandled-void-promise.runners=["vitest"]',
      'report-module-load-effects.common-js-exports=true',
      'no-unsafe-deserialization.yaml-major=3',
      'no-route-without-auth.entries=["route__requireAuth"]',
      'no-sql-string-building.sql-library=kysely',
      'require-http-timeout.fetch=false',
      'require-http-timeout.node-fetch-timeout=false',
      'require-http-timeout.project-defaults=axios,got',
    ]);
  });

  it('tells the request-text rule that the project trims request text in one place', () => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-trimmer-')));
    mkdirSync(path.join(directory, 'src'));
    writeFileSync(path.join(directory, 'package.json'), '{}');
    const registration = ['app.useGlobalPipes', '(new TrimPipe());'].join('');
    writeFileSync(path.join(directory, 'src/main.ts'), registration);
    const rules = { 'nitpicker/no-untrimmed-request-text': 'error' };
    try {
      expect(settingsOf(rules, path.join(directory, 'src/a.ts'))).toEqual([
        'no-untrimmed-request-text.global-trimmer=true',
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('conditions the engine asks about', () => {
  it('tells production sources from tests, fixtures and dependencies', () => {
    const production = condition('no-copied-constant', 'production-source');
    const other = condition('no-copied-constant', 'non-production-source');
    const paths = [
      'src/a.ts',
      'test/a.ts',
      'src/a.test.ts',
      'src/fixtures/a.ts',
      'node_modules/x/a.ts',
    ];

    expect(paths.map((file) => production(file, file))).toEqual([true, false, false, false, false]);
    expect(paths.map((file) => other(file, file))).toEqual([false, true, true, true, true]);
  });

  it('answers module and stylesheet questions', () => {
    const productionModule = condition('no-internal-module-mocks', 'production-module');
    const notStylesheet = condition('report-module-load-effects', 'not-stylesheet');
    const notRuntime = condition('test-must-use-production-runtime', 'not-production-runtime');
    const notBrowser = condition('test-must-use-production-runtime', 'not-browser-test-module');

    expect([
      productionModule('../src/a', `${root}/test/a.test.ts`),
      productionModule('vitest', 'a.ts'),
    ]).toEqual([true, false]);
    expect([notStylesheet('./a.css', 'a.ts'), notStylesheet('./a', 'a.ts')]).toEqual([false, true]);
    expect([
      notRuntime('../src/a', `${root}/test/a.test.ts`),
      notRuntime('node:fs', 'test/a.test.ts'),
    ]).toEqual([false, true]);
    expect([notBrowser('@playwright/test', 'a.ts'), notBrowser('vitest', 'a.ts')]).toEqual([
      false,
      true,
    ]);
  });
});
