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
const ADDITIVE_PRECEDENCE_TOOLS = new Set(['knip', 'dependency-cruiser']);

function presetLoosened({ before, after, scope }) {
  const from = before ?? DEFAULT_PRESET;
  const to = after ?? DEFAULT_PRESET;
  if (from === to || STRICTER_PRESET.get(from) === to) {
    return false;
  }
  return before !== undefined || to === 'javascript' || scope.presetRequired !== true;
}

const PROJECT_ANYWHERE_TOOLS = new Set(['eslint']);

function projectWeight(precedence, tool) {
  if (PROJECT_ANYWHERE_TOOLS.has(tool) && precedence.includes('project')) {
    return precedence[0] === 'project' ? 2 : 1;
  }
  if (precedence[0] !== 'project') {
    return 0;
  }
  return precedence.includes('nitpicker') ? 1 : 2;
}

function additiveWeight(precedence) {
  if (!precedence.includes('project')) {
    return 0;
  }
  return precedence[0] === 'project' ? 2 : 1;
}

function precedenceLoosened({ before = DEFAULT_PRECEDENCE, after = DEFAULT_PRECEDENCE, setting }) {
  const tool = setting.split('.')[1];
  if (ADDITIVE_PRECEDENCE_TOOLS.has(tool)) {
    return additiveWeight(after) > additiveWeight(before);
  }
  return UNION_PRECEDENCE_TOOLS.has(tool)
    ? before.includes('nitpicker') && !after.includes('nitpicker')
    : projectWeight(after, tool) > projectWeight(before, tool);
}

function listShrank({ before = [], after = [] }) {
  const kept = new Set(after.map((entry) => JSON.stringify(entry)));
  return before.some((entry) => !kept.has(JSON.stringify(entry)));
}

function lost(before = [], after = []) {
  return before.some((name) => !after.includes(name));
}

function contractLoosened(before, after) {
  return (
    after === undefined ||
    lost(before.open, after.open) ||
    lost(after.close, before.close) ||
    lost(before.steps, after.steps)
  );
}

function protocolsLoosened({ before = [], after = [] }) {
  const heads = new Map(after.map((contract) => [contract.type, contract]));
  return before.some((contract) => contractLoosened(contract, heads.get(contract.type)));
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
  [/^preset$/u, 'preset', presetLoosened],
  [/^react\.enabled$/u, 'react-disabled', turnedOff(false)],
  [/^i18n\.enabled$/u, 'i18n-disabled', turnedOff(false)],
  [/^python\.importLinter$/u, 'import-linter-disabled', turnedOff(false)],
  [/^kotlin\.formatter$/u, 'kotlin-formatter-off', turnedOff('none')],
  [/^kotlin\.detektConfig$/u, 'kotlin-detekt-config', () => true],
  [/^go\.formatters$/u, 'go-formatters-dropped', formattersDropped],
  [/^go\.buildTags$/u, 'go-build-tags-dropped', listShrank],
  [/^tools\.[^.]+\.precedence$/u, 'tool-precedence', precedenceLoosened],
  [/^protocols$/u, 'protocols-loosened', protocolsLoosened],
  [/^spring\.roles\.[^.]+$/u, 'spring-roles-shrank', listShrank],
];

export function looseningKindOfSetting(change, scope) {
  return LOOSENING_SETTINGS.find(
    ([pattern, , loosens]) => pattern.test(change.setting) && loosens({ ...change, scope }),
  )?.[1];
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
    loosened: described('raised', ({ before, after }) => after > before).map((text) => ({
      text,
      kind: 'threshold',
    })),
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
        return [{ text: `analyzer removed: ${entry.name}`, kind: 'analyzer-changed' }];
      }
      return JSON.stringify(head) === JSON.stringify(entry)
        ? []
        : [{ text: `analyzer changed: ${entry.name}`, kind: 'analyzer-changed' }];
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
        .map((name) => ({ text: `analyzer disabled: ${name}`, kind: 'analyzer-disabled' })),
      changed: before
        .filter((name) => !after.includes(name))
        .map((name) => `analyzer enabled: ${name}`),
    },
    thresholdChanges(baseConfig.thresholds, headConfig.thresholds),
    analyzerChanges(baseConfig.analyzers, headConfig.analyzers),
  ];
}
