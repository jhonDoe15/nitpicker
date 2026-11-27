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
import { featureOf } from '../rules/contracts/contract-infrastructure-type.mts';
import { testSourcesFact } from './test-sources-fact.mts';

const stylesheetSpecifier: RegExp = untypedStylesheetSpecifier;

const TYPED = { needs: 'types' } as const;
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

export const ENGINE_PLUGIN_RULES: ReadonlyMap<string, EngineRule> = new Map<string, EngineRule>([
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
  ['no-blank-number-coercion', TYPED],
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
  ['no-dropped-delegate-result', TYPED],
  ['no-eager-relation', {}],
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
  ['no-forwarding-method-alias', TYPED],
  ['no-forwarding-wrapper', TYPED],
  ['no-in-presence-check', TYPED],
  ['no-listen-on-all-interfaces', {}],
  ['no-io-in-loop', EFFECTS],
  ['no-lazy-relation-in-loop', TYPED],
  ['no-local-time-zone', TYPED],
  ['no-lookup-as-presence', TYPED],
  ['no-many-to-many-cascade-remove', {}],
  ['no-mutating-method-in-domain', TYPED],
  ['no-orm-query-logging', {}],
  ['no-orm-schema-sync', {}],
  ['no-parameter-mutation', TYPED],
  ['no-remote-call-in-transaction', EFFECTS],
  ['no-remote-call-under-lock', EFFECTS],
  ['no-retry-without-idempotency', EFFECTS],
  ['no-dual-write', EFFECTS],
  ['no-stale-retry-after-conflict', EFFECTS],
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
  ['no-shadowed-spread-key', TYPED],
  ['no-silent-catch', {}],
  ['no-string-as-regex', TYPED],
  ['no-swapped-arguments', TYPED],
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
  ['no-unpaged-listing', {}],
  ['no-unversioned-orm-entity', TYPED],
  ['no-wait-for-with-fake-timers', {}],
  [
    'preserve-error-cause',
    { facts: (_filename, options) => ({ options: JSON.stringify(options[0] ?? {}) }) },
  ],
  ['react-test-no-implementation-details', {}],
  ['require-error-listener', {}],
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
