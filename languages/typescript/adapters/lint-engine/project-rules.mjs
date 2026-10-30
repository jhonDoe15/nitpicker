import { isPlainObject, sameJson } from '../../../../shared/config.mjs';

const OFF_SEVERITIES = new Set([0, '0', 'off']);
const LIST_OPTION_RULES = new Set([
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
]);
const THRESHOLD_RULE = /(?:^|\/)(?:max-[\w-]+|complexity)$/u;

function isOff(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  return OFF_SEVERITIES.has(typeof severity === 'string' ? severity.toLowerCase() : severity);
}

export function ownedPolicy(entries) {
  return {
    enabled: new Set(
      entries.flatMap((entry) =>
        Object.entries(entry?.rules ?? {})
          .filter(([, setting]) => !isOff(setting))
          .map(([ruleId]) => ruleId),
      ),
    ),
    plugins: new Set(entries.flatMap((entry) => Object.keys(entry?.plugins ?? {}))),
    settings: new Set(entries.flatMap((entry) => Object.keys(entry?.settings ?? {}))),
  };
}

function parts(setting) {
  return Array.isArray(setting) ? [setting[0], setting.slice(1)] : [setting, []];
}

function limitOf(option) {
  if (typeof option === 'number') {
    return { limit: option, rest: {} };
  }
  if (isPlainObject(option) && typeof option.max === 'number') {
    const { max, ...rest } = option;
    return { limit: max, rest };
  }
  return undefined;
}

function clamped(nitpicker, project) {
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

function mergedOptions(ruleId, nitpicker, project) {
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

function mergedSetting(ruleId, nitpickerSetting, projectSetting) {
  const [, nitpickerOptions] = parts(nitpickerSetting);
  const [severity, projectOptions] = parts(projectSetting);
  const { options, replaced } = mergedOptions(ruleId, nitpickerOptions, projectOptions);
  return { setting: [severity, ...options], replaced };
}

function asList(pattern) {
  return Array.isArray(pattern) ? pattern : [pattern];
}

function bothFiles(policyFiles, projectFiles) {
  if (policyFiles === undefined || projectFiles === undefined) {
    return policyFiles ?? projectFiles;
  }
  return policyFiles.flatMap((own) =>
    projectFiles.map((theirs) => [...asList(own), ...asList(theirs)]),
  );
}

function bothScopes(policyEntry, projectEntry) {
  const files = bothFiles(policyEntry.files, projectEntry.files);
  const ignores = [...(policyEntry.ignores ?? []), ...(projectEntry.ignores ?? [])];
  return {
    ...(files === undefined ? {} : { files }),
    ...(ignores.length === 0 ? {} : { ignores }),
  };
}

function projectSettingsFor(policyEntry, projectEntry) {
  return Object.entries(policyEntry?.rules ?? {}).flatMap(([ruleId, setting]) => {
    const projectSetting = projectEntry.rules?.[ruleId];
    return isOff(setting) || projectSetting === undefined || isOff(projectSetting)
      ? []
      : [{ ruleId, ...mergedSetting(ruleId, setting, projectSetting) }];
  });
}

function entriesAfter(policyEntry, projectEntries) {
  return projectEntries.flatMap((projectEntry) => {
    const settings = projectSettingsFor(policyEntry, projectEntry);
    if (settings.length === 0) {
      return [];
    }
    return [
      {
        ...(projectEntry.name === undefined ? {} : { name: projectEntry.name }),
        ...bothScopes(policyEntry, projectEntry),
        rules: Object.fromEntries(settings.map(({ ruleId, setting }) => [ruleId, setting])),
      },
    ];
  });
}

export function withProjectSettings(policyEntries, projectEntries) {
  return policyEntries.flatMap((entry) => [entry, ...entriesAfter(entry, projectEntries)]);
}

export function replacedOptionRules(policyEntries, projectEntries) {
  const replaced = policyEntries.flatMap((policyEntry) =>
    projectEntries.flatMap((projectEntry) =>
      projectSettingsFor(policyEntry, projectEntry)
        .filter((setting) => setting.replaced)
        .map(({ ruleId }) => ruleId),
    ),
  );
  return [...new Set(replaced)].toSorted();
}
