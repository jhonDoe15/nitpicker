import type { Environment } from '../../../../../shared/processes/environment.mts';
import { loggerShapesFact } from './logger-shapes-fact.mts';
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

const stylesheetSpecifier: RegExp = untypedStylesheetSpecifier;

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
};

export const ENGINE_PLUGIN_RULES: ReadonlyMap<string, EngineRule> = new Map<string, EngineRule>([
  ['hover-test-needs-keyboard', {}],
  ['no-add-only-collection', {}],
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
  ['no-listen-on-all-interfaces', {}],
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
  ['no-silent-catch', {}],
  ['no-wait-for-with-fake-timers', {}],
  [
    'preserve-error-cause',
    { facts: (_filename, options) => ({ options: JSON.stringify(options[0] ?? {}) }) },
  ],
  ['react-test-no-implementation-details', {}],
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
