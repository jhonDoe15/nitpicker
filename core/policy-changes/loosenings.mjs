import { DEFAULT_CRAP_SCORE_LIMIT, FILE_LIMIT_DEFAULTS } from '../../shared/policy.mjs';

const THRESHOLD_DEFAULTS = { crapLimit: DEFAULT_CRAP_SCORE_LIMIT, ...FILE_LIMIT_DEFAULTS };
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
  [/^tools\.[^.]+\.precedence$/u, precedenceLoosened],
];

export function loosensSetting(change, scope) {
  return LOOSENING_SETTINGS.some(
    ([pattern, loosens]) => pattern.test(change.setting) && loosens({ ...change, scope }),
  );
}

function raisedThresholds(baseThresholds = {}, headThresholds = {}) {
  const keys = [...new Set([...Object.keys(baseThresholds), ...Object.keys(headThresholds)])];
  return keys.flatMap((key) => {
    const before = baseThresholds[key] ?? THRESHOLD_DEFAULTS[key];
    const after = headThresholds[key] ?? THRESHOLD_DEFAULTS[key];
    return after > before
      ? [`threshold ${key} raised from ${String(before)} to ${String(after)}`]
      : [];
  });
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
  const disabled = (headConfig.disable ?? []).filter(
    (name) => !(baseConfig.disable ?? []).includes(name),
  );
  return [
    { loosened: disabled.map((name) => `analyzer disabled: ${name}`), changed: [] },
    { loosened: raisedThresholds(baseConfig.thresholds, headConfig.thresholds), changed: [] },
    analyzerChanges(baseConfig.analyzers, headConfig.analyzers),
  ];
}
