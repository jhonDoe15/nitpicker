import { isPlainObject } from '../../../config.mts';
import { fieldOf } from '../../../values/readers.mts';
import type { FactPolicy } from './evaluate-types.mts';

type PolicyShape = readonly [
  string,
  (policy: Readonly<Record<string, unknown>>) => boolean,
  string,
];

function isGlobs(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((glob) => typeof glob === 'string');
}

function isListOf(value: unknown, isEntry: (entry: unknown) => boolean): boolean {
  return value === undefined || (Array.isArray(value) && value.every(isEntry));
}

function isException(entry: unknown): boolean {
  return (
    isPlainObject(entry) &&
    typeof entry['rule'] === 'string' &&
    (isGlobs(entry['paths']) || typeof entry['glob'] === 'string')
  );
}

function isAllowEntry(entry: unknown): boolean {
  return (
    isPlainObject(entry) &&
    typeof entry['contains'] === 'string' &&
    (entry['paths'] === undefined || isGlobs(entry['paths']))
  );
}

function isProtocol(entry: unknown): boolean {
  return (
    isPlainObject(entry) &&
    typeof entry['type'] === 'string' &&
    [entry['open'], entry['close']].every((names) => isGlobs(names) && names.length > 0) &&
    (entry['steps'] === undefined || isGlobs(entry['steps'])) &&
    (entry['reason'] === undefined ||
      (typeof entry['reason'] === 'string' && entry['reason'] !== ''))
  );
}

function isOptionalObject(value: unknown): boolean {
  return value === undefined || isPlainObject(value);
}

const LAYOUT_KEYS: readonly (readonly [string, string])[] = [
  ['sharedRoots', 'an array of folder globs'],
  ['notFeatures', 'an array of folder names'],
  ['notFeatureFolders', 'an array of folders'],
  ['featureRoots', 'an array of folder globs'],
];

const LAYOUT_GLOBS: readonly PolicyShape[] = LAYOUT_KEYS.map(([key, shape]): PolicyShape => [
  `policy.layout.${key}`,
  (policy) => {
    const value = fieldOf(policy['layout'], key);
    return value === undefined || isGlobs(value);
  },
  shape,
]);

const AN_OBJECT = 'an object';

const POLICY_SHAPES: readonly PolicyShape[] = [
  ['policy.testConsole', (policy) => isOptionalObject(policy['testConsole']), AN_OBJECT],
  ['policy.layout', (policy) => isOptionalObject(policy['layout']), AN_OBJECT],
  [
    'policy.exceptions',
    (policy) => isListOf(policy['exceptions'], isException),
    'an array of { rule, paths } entries',
  ],
  [
    'policy.protocols',
    (policy) => isListOf(policy['protocols'], isProtocol),
    'an array of { type, open, close, steps?, reason? } entries',
  ],
  [
    'policy.testConsole.allow',
    (policy) => isListOf(fieldOf(policy['testConsole'], 'allow'), isAllowEntry),
    'an array of { contains, paths? } entries',
  ],
  ...LAYOUT_GLOBS,
  [
    'policy.layout.aliases',
    (policy) => {
      const aliases = fieldOf(policy['layout'], 'aliases');
      return (
        aliases === undefined ||
        (isPlainObject(aliases) &&
          Object.values(aliases).every((folder) => typeof folder === 'string'))
      );
    },
    'an object of folder to folder',
  ],
];

const POLICY_ADVICE = 'pass the head policy (readHeadPolicyFile())';

export function assertPolicy(policy: unknown): asserts policy is FactPolicy {
  if (!isPlainObject(policy)) {
    throw new TypeError(`policy must be ${AN_OBJECT}: ${POLICY_ADVICE}`);
  }
  const failed = POLICY_SHAPES.find(([, check]) => !check(policy));
  if (failed !== undefined) {
    const [name, , shape] = failed;
    throw new TypeError(`${name} must be ${shape}: ${POLICY_ADVICE}`);
  }
}
