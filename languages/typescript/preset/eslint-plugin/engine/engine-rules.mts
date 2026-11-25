import type { Environment } from '../../../../../shared/processes/environment.mts';
import { isCompositionRootFile } from '../rules/boundaries/composition-root-files.mts';

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
  ['react-test-no-implementation-details', {}],
  ['settle-pending-on-close', {}],
]);

export const PLUGIN_RULE_PREFIX = 'nitpicker/';
