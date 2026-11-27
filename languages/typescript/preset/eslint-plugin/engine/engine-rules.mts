import type { Environment } from '../../../../../shared/processes/environment.mts';
import { loggerShapesFact } from './logger-shapes-fact.mts';
import { validationPhraseFact } from './validation-phrase-fact.mts';
import { isCompositionRootFile } from '../rules/boundaries/composition-root-files.mts';
import { productionModulePath } from '../test-isolation/production-source.mts';
import { stylesheetSpecifier as untypedStylesheetSpecifier } from '../../layout.mts';
import { isBrowserTestModule } from '../rules/analysis/test-code-analysis.mts';
import {
  isExemptPath,
  reachesProduction,
} from '../rules/test-runtime/assertions/test-must-use-production-runtime.mts';
import { vocabularyOf } from '../rules/runner-apis/runner-option.mts';
import { readLayout } from '../rules/typed/policy-views.mts';
import type { RunnerVocabulary } from '../../test-runner/vocabulary/typed-vocabulary.mts';
import path from 'node:path';
import { featureOf } from '../rules/contracts/contract-infrastructure-type.mts';
import { testSourcesFact } from './test-sources-fact.mts';
import { hasGlobalTrimmer } from '../rules/request-text/global-trimmer.mts';

const stylesheetSpecifier: RegExp = untypedStylesheetSpecifier;

const TYPED = { needs: 'types' } as const;
const DEFAULT_COMPLEXITY_LIMIT = 15;
const EFFECTS: EngineRule = {
  ...TYPED,
  facts: (_filename, _options, { root }) => testSourcesFact(root),
};

const layout = readLayout();

function isProductionSource(relative: string): boolean {
  return !(
    layout.isTestPath(relative) ||
    layout.isTestFile(relative) ||
    layout.isFixturePath(relative) ||
    layout.isGeneratedPath(relative)
  );
}

export type FactProject = { readonly root: string; readonly environment: Environment };

export type FileFacts = (
  filename: string,
  options: readonly unknown[],
  project: FactProject,
) => Record<string, string>;

type Condition = (value: string, filename: string) => boolean;

type Conditions = Readonly<Record<string, Condition>>;

export type EngineRule = {
  readonly facts?: FileFacts;
  readonly conditions?: Conditions;
  readonly needs?: 'types';
};

function testRootOf(options: readonly unknown[]): string {
  const root: unknown = Reflect.get(Object(options[0]), 'testRoot');
  return typeof root === 'string' ? root : 'test';
}

function kebab(word: string): string {
  return word.replaceAll(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`);
}

function runnerWords(...words: readonly (keyof RunnerVocabulary)[]): FileFacts {
  return (_filename, options) => {
    const vocabulary = vocabularyOf({ options });
    return Object.fromEntries(words.map((word) => [kebab(word), vocabulary[word]]));
  };
}

function optionFacts(...names: readonly string[]): FileFacts {
  const text = (options: readonly unknown[], name: string): string =>
    String(Reflect.get(Object(options[0]), name) ?? '');
  return (_filename, options) =>
    Object.fromEntries(names.map((name) => [kebab(name), text(options, name)]));
}

export const ENGINE_PLUGIN_RULES: ReadonlyMap<string, EngineRule> = new Map<string, EngineRule>([
  [
    'cognitive-complexity',
    { facts: (_filename, options) => ({ max: String(options[0] ?? DEFAULT_COMPLEXITY_LIMIT) }) },
  ],
  [
    'contract-infrastructure-type',
    { ...TYPED, facts: (filename) => ({ feature: featureOf(filename) }) },
  ],
  ['exhaustive-union-predicate', TYPED],
  ['handler-entity-type', TYPED],
  ['hover-test-needs-keyboard', {}],
  ['no-accumulator-concat', TYPED],
  ['no-add-only-collection', {}],
  ['no-array-spread-arguments', TYPED],
  [
    'no-assertion-in-loop',
    {
      facts: (_filename, options) => ({
        'assertion-function-names': JSON.stringify(
          Reflect.get(Object(options[0]), 'assertionFunctionNames') ?? [],
        ),
      }),
    },
  ],
  ['no-blank-number-coercion', TYPED],
  ['no-btoa-on-runtime-text', {}],
  ['no-case-mixed-header-merge', {}],
  ['no-case-sensitive-path-compare', {}],
  ['no-chunkwise-stream-text', TYPED],
  [
    'no-copied-constant',
    {
      facts: (_filename, _options, { root }) => ({ root }),
      conditions: {
        'production-source': (value) => isProductionSource(value),
        'non-production-source': (value) => !isProductionSource(value),
      },
    },
  ],
  ['no-copy-pasted-tests', { facts: runnerWords('eachCase') }],
  ['no-disabled-tls-verification', {}],
  ['no-directory-passing-existence-check', {}],
  ['no-double-decode', {}],
  ['no-dropped-delegate-result', TYPED],
  ['no-dynamic-import-of-path', {}],
  ['no-eager-relation', {}],
  ['no-error-response-without-status', {}],
  ['no-empty-every-signal', TYPED],
  ['no-expanding-replacement-string', TYPED],
  ['no-external-executables-in-unit-tests', {}],
  [
    'no-internal-module-mocks',
    {
      conditions: {
        'production-module': (value, filename) =>
          productionModulePath(value, filename) !== undefined,
      },
    },
  ],
  ['no-falsy-default', TYPED],
  ['no-git-repository-per-test', { facts: runnerWords('sharedSetupHook') }],
  ['no-hardcoded-secret', {}],
  ['no-forwarding-method-alias', TYPED],
  ['no-forwarding-wrapper', TYPED],
  ['no-in-presence-check', TYPED],
  ['no-incomplete-escaping', {}],
  [
    'no-interval-polling-in-tests',
    {
      facts: (filename, options, project) => ({
        ...runnerWords('pollInstead')(filename, options, project),
        fixture: String(layout.isTestFixture(filename)),
      }),
    },
  ],
  ['no-listen-on-all-interfaces', {}],
  ['no-io-in-loop', EFFECTS],
  ['no-lazy-relation-in-loop', TYPED],
  ['no-lossy-utf8-decode', {}],
  ['no-local-time-zone', TYPED],
  ['no-loaded-rows-saved-back', TYPED],
  ['no-lookup-as-presence', TYPED],
  ['no-many-to-many-cascade-remove', {}],
  ['no-mutating-method-in-domain', TYPED],
  ['no-node-process-per-test', {}],
  ['no-non-latin1-header-value', {}],
  ['no-orm-query-logging', {}],
  ['no-orm-schema-sync', {}],
  ['no-parameter-mutation', TYPED],
  ['no-raw-http-value', {}],
  ['no-remote-call-in-transaction', EFFECTS],
  ['no-remote-call-under-lock', EFFECTS],
  ['no-retry-without-idempotency', EFFECTS],
  ['no-dual-write', EFFECTS],
  ['no-stale-retry-after-conflict', EFFECTS],
  ['no-unchecked-response-json', {}],
  ['no-unchecked-url-sink', {}],
  ['no-unencoded-url-part', {}],
  ['no-unescaped-css-selector', {}],
  ['no-unescaped-filter-value', {}],
  ['no-unescaped-html-interpolation', {}],
  ['no-unescaped-pattern-translation', {}],
  ['no-unisolated-job-loop', EFFECTS],
  [
    'no-production-console',
    {
      facts: (filename, options) => ({
        'streams-allowed': String(
          Reflect.get(Object(options[0]), 'allowStandardStreams') === true ||
            isCompositionRootFile({ filename, options }),
        ),
      }),
    },
  ],
  ['no-secret-in-log', {}],
  ['no-send-without-return', {}],
  ['no-server-or-worker-per-test', { facts: runnerWords('sharedSetupHook') }],
  ['no-self-recursion', {}],
  ['no-shadowed-spread-key', TYPED],
  ['no-shared-test-state', {}],
  ['no-silent-catch', {}],
  ['no-string-as-regex', TYPED],
  ['no-swapped-arguments', TYPED],
  [
    'no-test-helpers-in-source',
    {
      facts: (filename, options, { root }) => ({
        path: path.relative(root, filename),
        colocated: String(Reflect.get(Object(options[0]), 'colocated') === true),
        'test-root': testRootOf(options),
      }),
    },
  ],
  ['no-switched-off-tests', {}],
  [
    'no-unhandled-void-promise',
    {
      needs: 'types',
      facts: (_filename, options) => ({
        runners: JSON.stringify(Reflect.get(Object(options[0]), 'runners') ?? []),
      }),
    },
  ],
  ['no-union-order-dependence', TYPED],
  [
    'no-unknown-in-domain',
    {
      ...TYPED,
      facts: (filename, options, project) => ({
        jsdoc: String(Reflect.get(Object(options[0]), 'jsdoc') === true),
        phrase: validationPhraseFact(filename, project),
      }),
    },
  ],
  ['no-unbounded-query-array', {}],
  ['no-unordered-query', {}],
  ['no-unowned-async-assertion', {}],
  ['no-unpaged-listing', {}],
  ['no-unresolved-relative-url', {}],
  ['no-unsafe-deserialization', { facts: optionFacts('yamlMajor') }],
  ['no-unstripped-remote-text', {}],
  ['no-uncoerced-request-input', {}],
  [
    'no-untrimmed-request-text',
    { facts: (filename) => ({ 'global-trimmer': String(hasGlobalTrimmer(filename)) }) },
  ],
  ['no-slash-only-redirect-guard', {}],
  [
    'no-route-without-auth',
    {
      facts: (_filename, options) => ({
        entries: JSON.stringify(Reflect.get(Object(options[0]), 'entries') ?? []),
      }),
    },
  ],
  ['no-sql-string-building', { facts: optionFacts('sqlLibrary') }],
  ['no-weak-hash', {}],
  ['no-unversioned-orm-entity', TYPED],
  ['no-wait-for-with-fake-timers', {}],
  ['no-whole-rows-for-one-value', TYPED],
  [
    'preserve-error-cause',
    { facts: (_filename, options) => ({ options: JSON.stringify(options[0] ?? {}) }) },
  ],
  ['react-test-no-implementation-details', {}],
  ['require-client-timeout', {}],
  ['require-error-listener', {}],
  ['require-http-timeout', { facts: optionFacts('fetch', 'nodeFetchTimeout', 'projectDefaults') }],
  [
    'report-module-load-effects',
    {
      facts: (_filename, options) => ({
        'common-js-exports': String(Reflect.get(Object(options[0]), 'commonJsExports') === true),
      }),
      conditions: {
        'not-stylesheet': (value) => !stylesheetSpecifier.test(value),
      },
    },
  ],
  ['settle-pending-on-close', {}],
  [
    'structured-catch-logging',
    {
      facts: (filename, _options, project) => ({
        'logger-shapes': loggerShapesFact(filename, project),
      }),
    },
  ],
  [
    'test-must-use-production-runtime',
    {
      facts: (filename, options, { root }) => ({
        exempt: String(isExemptPath({ cwd: root, options }, filename.replaceAll('\\', '/'))),
        'helper-file': vocabularyOf({ options }).helperFile,
      }),
      conditions: {
        'not-production-runtime': (value, filename) =>
          !reachesProduction(filename.replaceAll('\\', '/'), value),
        'not-browser-test-module': (value) => !isBrowserTestModule(value),
      },
    },
  ],
  ['time-unit-mismatch', {}],
]);

export const PLUGIN_RULE_PREFIX = 'nitpicker/';
