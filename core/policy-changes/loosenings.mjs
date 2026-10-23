import {
  DEFAULT_CRAP_SCORE_LIMIT,
  FILE_LIMIT_DEFAULTS,
  TEST_TIME_DEFAULTS,
} from '../../shared/policy.mjs';

export const THRESHOLD_DEFAULTS = {
  crapLimit: DEFAULT_CRAP_SCORE_LIMIT,
  ...FILE_LIMIT_DEFAULTS,
  ...TEST_TIME_DEFAULTS,
};
const DEFAULT_PRESET = 'typescript';
const STRICTER_PRESET = new Map([['javascript', 'typescript']]);
const DEFAULT_PRECEDENCE = ['nitpicker'];
const UNION_PRECEDENCE_TOOLS = new Set(['pmd']);

function presetLoosened({ before, after, scope }) {
  const from = before ?? DEFAULT_PRESET;
  const to = after ?? DEFAULT_PRESET;
  if (from === to || STRICTER_PRESET.get(from) === to) {
    return false;
  }
  return before !== undefined || to === 'javascript' || scope.presetRequired !== true;
}

function projectWeight(precedence) {
  if (precedence[0] !== 'project') {
    return 0;
  }
  return precedence.includes('nitpicker') ? 1 : 2;
}

function precedenceLoosened({ before = DEFAULT_PRECEDENCE, after = DEFAULT_PRECEDENCE, setting }) {
  const tool = setting.split('.')[1];
  return UNION_PRECEDENCE_TOOLS.has(tool)
    ? before.includes('nitpicker') && !after.includes('nitpicker')
    : projectWeight(after) > projectWeight(before);
}

function entriesRemoved({ before = [], after = [] }) {
  return before.some((entry) => !after.includes(entry));
}

function formattersDropped({ before = [], after = [] }) {
  return before.some((formatter) =>
    formatter === 'gofmt' ? after.length === 0 : !after.includes(formatter),
  );
}

function turnedOff(offValue) {
  return ({ before, after }) => after === offValue && before !== offValue;
}

const LOOSENING_SETTINGS = [
  [/^preset$/u, presetLoosened],
  [/^react\.enabled$/u, turnedOff(false)],
  [/^i18n\.enabled$/u, turnedOff(false)],
  [/^python\.importLinter$/u, turnedOff(false)],
  [/^kotlin\.formatter$/u, turnedOff('none')],
  [/^kotlin\.detektConfig$/u, () => true],
  [/^go\.formatters$/u, formattersDropped],
  [/^go\.buildTags$/u, entriesRemoved],
  [/^tools\.[^.]+\.precedence$/u, precedenceLoosened],
];

export function loosensSetting(change, scope) {
  return LOOSENING_SETTINGS.some(
    ([pattern, loosens]) => pattern.test(change.setting) && loosens({ ...change, scope }),
  );
}

function thresholdChanges(baseThresholds = {}, headThresholds = {}) {
  const keys = [...new Set([...Object.keys(baseThresholds), ...Object.keys(headThresholds)])];
  const moves = keys.map((key) => ({
    key,
    before: baseThresholds[key] ?? THRESHOLD_DEFAULTS[key],
    after: headThresholds[key] ?? THRESHOLD_DEFAULTS[key],
  }));
  function described(verb, wanted) {
    return moves
      .filter(wanted)
      .map(
        ({ key, before, after }) =>
          `threshold ${key} ${verb} from ${String(before)} to ${String(after)}`,
      );
  }
  return {
    loosened: described('raised', ({ before, after }) => after > before),
    changed: described('lowered', ({ before, after }) => after < before),
  };
}

function analyzerChanges(baseAnalyzers = [], headAnalyzers = []) {
  const heads = new Map(headAnalyzers.map((entry) => [entry.name, entry]));
  const bases = new Set(baseAnalyzers.map(({ name }) => name));
  return {
    loosened: baseAnalyzers.flatMap((entry) => {
      const head = heads.get(entry.name);
      if (head === undefined) {
        return [`analyzer removed: ${entry.name}`];
      }
      return JSON.stringify(head) === JSON.stringify(entry)
        ? []
        : [`analyzer changed: ${entry.name}`];
    }),
    changed: headAnalyzers
      .filter(({ name }) => !bases.has(name))
      .map(({ name }) => `analyzer added: ${name}`),
  };
}

export function listedChanges(baseConfig, headConfig) {
  const before = baseConfig.disable ?? [];
  const after = headConfig.disable ?? [];
  return [
    {
      loosened: after
        .filter((name) => !before.includes(name))
        .map((name) => `analyzer disabled: ${name}`),
      changed: before
        .filter((name) => !after.includes(name))
        .map((name) => `analyzer enabled: ${name}`),
    },
    thresholdChanges(baseConfig.thresholds, headConfig.thresholds),
    analyzerChanges(baseConfig.analyzers, headConfig.analyzers),
  ];
}
