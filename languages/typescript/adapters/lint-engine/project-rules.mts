import { sameJson } from '../../../../core/policy-changes/types/config-views.mts';
import { isPlainObject } from '../../../../shared/values/readers.mts';
import { byCodeUnits } from '../../../../core/scope/mutation-scope.mts';
import { listField, recordField } from './typed/flat-config.mts';
import type { FlatEntry, OwnedPolicy } from './typed/flat-config.mts';

type Options = readonly unknown[];
type Entries = readonly FlatEntry[];

const RULES = 'rules';
const OFF_SEVERITIES = new Set<unknown>([0, '0', 'off']);
const LIST_OPTION_RULES = new Set([
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
]);
const THRESHOLD_RULE = /(?:^|\/)(?:max-[\w-]+|complexity)$/u;

function isOff(setting: unknown): boolean {
  const severity: unknown = Array.isArray(setting) ? setting[0] : setting;
  return OFF_SEVERITIES.has(typeof severity === 'string' ? severity.toLowerCase() : severity);
}

export function ownedPolicy(entries: Entries): OwnedPolicy {
  return {
    enabled: new Set(
      entries.flatMap((entry) =>
        Object.entries(recordField(entry, RULES) ?? {})
          .filter(([, setting]) => !isOff(setting))
          .map(([ruleId]) => ruleId),
      ),
    ),
    plugins: new Set(entries.flatMap((entry) => Object.keys(recordField(entry, 'plugins') ?? {}))),
    settings: new Set(
      entries.flatMap((entry) => Object.keys(recordField(entry, 'settings') ?? {})),
    ),
  };
}

function parts(setting: unknown): [unknown, readonly unknown[]] {
  const list: unknown[] | undefined = Array.isArray(setting) ? setting : undefined;
  return list === undefined ? [setting, []] : [list[0], list.slice(1)];
}

function limitOf(option: unknown) {
  if (typeof option === 'number') {
    return { limit: option, rest: {} };
  }
  if (isPlainObject(option) && typeof option['max'] === 'number') {
    const rest = Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'max'));
    return { limit: option['max'], rest };
  }
  return undefined;
}

function clamped(nitpicker: Options, project: Options): Options | undefined {
  const own = limitOf(nitpicker[0]);
  const theirs = limitOf(project[0]);
  if (nitpicker.length !== 1 || project.length !== 1 || own === undefined || theirs === undefined) {
    return undefined;
  }
  const limit = Math.min(own.limit, theirs.limit);
  if (!sameJson(own.rest, theirs.rest)) {
    return undefined;
  }
  return [typeof nitpicker[0] === 'number' ? limit : { ...own.rest, max: limit }];
}

function mergedOptions(ruleId: string, nitpicker: Options, project: Options) {
  if (project.length === 0 || sameJson(nitpicker, project)) {
    return { options: nitpicker, replaced: false };
  }
  if (LIST_OPTION_RULES.has(ruleId)) {
    const added = project.filter((option) => !nitpicker.some((own) => sameJson(own, option)));
    return { options: [...nitpicker, ...added], replaced: false };
  }
  const limited = THRESHOLD_RULE.test(ruleId) ? clamped(nitpicker, project) : undefined;
  return limited === undefined
    ? { options: project, replaced: true }
    : { options: limited, replaced: false };
}

function mergedSetting(ruleId: string, nitpickerSetting: unknown, projectSetting: unknown) {
  const [, nitpickerOptions] = parts(nitpickerSetting);
  const [severity, projectOptions] = parts(projectSetting);
  const { options, replaced } = mergedOptions(ruleId, nitpickerOptions, projectOptions);
  return { setting: [severity, ...options], replaced };
}

function asList(pattern: unknown): readonly unknown[] {
  return Array.isArray(pattern) ? pattern : [pattern];
}

function bothFiles(policyFiles: Options | undefined, projectFiles: Options | undefined) {
  if (policyFiles === undefined || projectFiles === undefined) {
    return policyFiles ?? projectFiles;
  }
  return policyFiles.flatMap((own) =>
    projectFiles.map((theirs) => [...asList(own), ...asList(theirs)]),
  );
}

function bothScopes(policyEntry: FlatEntry, projectEntry: FlatEntry) {
  const files = bothFiles(listField(policyEntry, 'files'), listField(projectEntry, 'files'));
  const ignores = [
    ...(listField(policyEntry, 'ignores') ?? []),
    ...(listField(projectEntry, 'ignores') ?? []),
  ];
  return {
    ...(files === undefined ? {} : { files }),
    ...(ignores.length === 0 ? {} : { ignores }),
  };
}

function projectSettingsFor(policyEntry: FlatEntry, projectEntry: FlatEntry) {
  return Object.entries(recordField(policyEntry, RULES) ?? {}).flatMap(([ruleId, setting]) => {
    const projectSetting = recordField(projectEntry, RULES)?.[ruleId];
    return isOff(setting) || projectSetting === undefined || isOff(projectSetting)
      ? []
      : [{ ruleId, ...mergedSetting(ruleId, setting, projectSetting) }];
  });
}

function entriesAfter(policyEntry: FlatEntry, projectEntries: Entries): FlatEntry[] {
  return projectEntries.flatMap((projectEntry) => {
    const settings = projectSettingsFor(policyEntry, projectEntry);
    if (settings.length === 0) {
      return [];
    }
    return [
      {
        ...(projectEntry['name'] === undefined ? {} : { name: projectEntry['name'] }),
        ...bothScopes(policyEntry, projectEntry),
        rules: Object.fromEntries(settings.map(({ ruleId, setting }) => [ruleId, setting])),
      },
    ];
  });
}

export function withProjectSettings(policyEntries: Entries, projectEntries: Entries): FlatEntry[] {
  return policyEntries.flatMap((entry) => [entry, ...entriesAfter(entry, projectEntries)]);
}

export function replacedOptionRules(policyEntries: Entries, projectEntries: Entries): string[] {
  const replaced = policyEntries.flatMap((policyEntry) =>
    projectEntries.flatMap((projectEntry) =>
      projectSettingsFor(policyEntry, projectEntry)
        .filter((setting) => setting.replaced)
        .map(({ ruleId }) => ruleId),
    ),
  );
  return [...new Set(replaced)].toSorted(byCodeUnits);
}
