import { CONFIG_FILE_NAME } from '../../shared/config.mjs';
import { FEATURE_LAYOUT_KEYS, isPlainObject, shownSetting } from './types/config-views.mts';
import type { Loosening, PolicyConfig, PolicyScope } from './types/policy-types.mts';
import { policyDigest } from '../diff/reporting/review/policy-findings.mts';
import { buildNarrowingChanges } from './build-files/build-narrowing.mts';
import { featureLayoutChanges } from './features/feature-layout-changes.mts';
import { toolConfigChanges } from './build-files/tool-config-changes.mts';
import { coveredPathChanges } from './paths/covered-paths.mts';
import { generatedMarkingChanges } from './paths/generated-marking.mts';
import { hiddenCodeChanges } from './paths/hidden-code.mts';
import { tsconfigChanges } from './paths/tsconfig-changes.mts';
import { listedChanges, looseningKindOfSetting } from './loosenings.mts';
import { timeoutChanges } from './timeout-changes.mts';
import { appendAll } from '../../shared/lists/lists.mts';

type SettingEntry = {
  readonly setting: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly text: string;
};
type Described = Loosening & { readonly key: string; readonly files: readonly string[] };
type PolicyChangeFields = {
  readonly policyChanges: string[];
  readonly policyLoosenings: string[];
  readonly policyKinds: Record<string, string | undefined>;
  readonly policyDigest?: string;
};
type Settings = Readonly<Record<string, unknown>>;

const LISTED_KEYS = new Set([
  'exclude',
  'disable',
  'exceptions',
  'thresholds',
  'analyzers',
  'duplicates',
  'analyzerTimeoutMinutes',
]);
const LISTED_LAYOUT_KEYS = new Set(['excludedGlobs', 'entryPoints', ...FEATURE_LAYOUT_KEYS]);

function withoutKeys(object: Settings, keys: ReadonlySet<string>): Settings {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)));
}

function leaves(value: unknown, prefix: string): (readonly [string, unknown])[] {
  const pending: (readonly [string, unknown])[] = [[prefix, value]];
  const found: (readonly [string, unknown])[] = [];
  for (const [path, node] of pending) {
    if (isPlainObject(node)) {
      appendAll(
        pending,
        Object.entries(node).map(([key, child]): readonly [string, unknown] => [
          `${path}.${key}`,
          child,
        ]),
      );
    } else {
      found.push([path, node]);
    }
  }
  return found;
}

function nestedWithout(settings: Settings, key: string, keys: ReadonlySet<string>): Settings {
  const nested = settings[key];
  return isPlainObject(nested) ? { [key]: withoutKeys(nested, keys) } : {};
}

function settingLeaves(config: PolicyConfig): Map<string, unknown> {
  const settings = withoutKeys(config, LISTED_KEYS);
  const nested = {
    ...nestedWithout(settings, 'python', new Set(['exceptions', 'entryPoints'])),
    ...nestedWithout(settings, 'layout', LISTED_LAYOUT_KEYS),
    ...(isPlainObject(settings['tools']) && isPlainObject(settings['tools']['tests'])
      ? {
          tools: {
            ...settings['tools'],
            tests: withoutKeys(settings['tools']['tests'], new Set(['timeouts'])),
          },
        }
      : {}),
  };
  return new Map(
    Object.entries({ ...settings, ...nested }).flatMap(([key, value]) => leaves(value, key)),
  );
}

function changedSettings(baseConfig: PolicyConfig, headConfig: PolicyConfig): SettingEntry[] {
  const before = settingLeaves(baseConfig);
  const after = settingLeaves(headConfig);
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((setting) => {
    const change = { setting, before: before.get(setting), after: after.get(setting) };
    return JSON.stringify(change.before) === JSON.stringify(change.after)
      ? []
      : [
          {
            ...change,
            text: `${setting}: ${shownSetting(change.before)} -> ${shownSetting(change.after)}`,
          },
        ];
  });
}

function loosening(entry: Loosening): Described {
  return { key: entry.text, files: [CONFIG_FILE_NAME], ...entry };
}

function sourceNote(scope: PolicyScope): string {
  const changed = scope.changedConfigLayers ?? [];
  const shared = changed.filter((label) => label !== CONFIG_FILE_NAME);
  if (shared.length === 0) {
    return '';
  }
  const own = changed.includes(CONFIG_FILE_NAME) ? [CONFIG_FILE_NAME] : [];
  return ` (from ${[...own, ...shared].join(' or ')})`;
}

function attributed(entries: readonly Loosening[], scope: PolicyScope): Described[] {
  const note = sourceNote(scope);
  return entries.map(loosening).map((entry) => ({ ...entry, text: `${entry.text}${note}` }));
}

function describedEntries(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): { loosened: Described[]; changed: string[] } {
  const settings = changedSettings(baseConfig, headConfig).map((entry) => ({
    ...entry,
    kind: looseningKindOfSetting(entry, scope),
  }));
  const configParts = [
    ...coveredPathChanges(baseConfig, headConfig, scope),
    ...listedChanges(baseConfig, headConfig),
    timeoutChanges(baseConfig, headConfig),
    hiddenCodeChanges(baseConfig, headConfig, scope),
    featureLayoutChanges(baseConfig, headConfig, scope),
  ];
  const scopeParts = [
    generatedMarkingChanges(scope),
    tsconfigChanges(scope),
    ...buildNarrowingChanges(scope),
    toolConfigChanges(scope),
  ];
  const parts = [...configParts, ...scopeParts];
  return {
    loosened: [
      ...attributed(
        configParts.flatMap((part) => part.loosened),
        scope,
      ),
      ...scopeParts.flatMap((part) => part.loosened).map(loosening),
      ...attributed(
        settings.filter(({ kind }) => kind !== undefined).map(({ text, kind }) => ({ text, kind })),
        scope,
      ),
      ...(scope.repositoryLoosenings ?? []).map(loosening),
    ],
    changed: [
      ...parts.flatMap((part) => part.changed),
      ...settings.filter(({ kind }) => kind === undefined).map(({ text }) => text),
    ],
  };
}

export function describePolicyChanges(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): { loosened: string[]; changed: string[] } {
  const { loosened, changed } = describedEntries(baseConfig, headConfig, scope);
  return { loosened: loosened.map(({ text }) => text), changed };
}

function evidenceDigest(loosened: readonly Described[], scope: PolicyScope): string {
  const files = [...new Set(loosened.flatMap((entry) => entry.files))].toSorted();
  const blobs = new Map(loosened.flatMap((entry) => Object.entries(entry.blobs ?? {})));
  return policyDigest({
    loosenings: loosened.map(({ key }) => key),
    files: [
      ...files.map((file) => [file, blobs.get(file) ?? scope.blobOf(file)]),
      ...scope.sharedConfigs,
      ...loosened.flatMap(({ evidence = [] }) => evidence),
    ],
  });
}

export function policyChangeFields(
  baseConfig: PolicyConfig,
  headConfig: PolicyConfig,
  scope: PolicyScope,
): PolicyChangeFields {
  const { loosened, changed } = describedEntries(baseConfig, headConfig, scope);
  const texts = loosened.map(({ text }) => text);
  return {
    policyChanges: [...texts, ...changed],
    policyLoosenings: texts,
    policyKinds: Object.fromEntries(loosened.map(({ text, kind }) => [text, kind])),
    ...(loosened.length === 0 ? {} : { policyDigest: evidenceDigest(loosened, scope) }),
  };
}
