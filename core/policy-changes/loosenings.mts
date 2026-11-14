import { textOf, textsOf } from '../../shared/values/readers.mts';
import {
  formattersDropped,
  listGrew,
  listShrank,
  protocolsLoosened,
} from './settings/list-looseners.mts';
import { thresholdsOf } from './types/config-readers.mts';
import { THRESHOLD_DEFAULTS } from './types/config-views.mts';
import type {
  ChangePart,
  ListedConfig,
  PolicyAnalyzer,
  PolicyScope,
  ScopedChange,
  SettingChange,
  SettingRule,
  SettingValues,
  Thresholds,
} from './types/policy-types.mts';

const DEFAULT_PRESET = 'typescript';
const STRICTER_PRESET = new Map([['javascript', 'typescript']]);
const NITPICKER = 'nitpicker';
const PROJECT = 'project';
const DEFAULT_PRECEDENCE = [NITPICKER];
const UNION_PRECEDENCE_TOOLS = new Set(['pmd']);
const ADDITIVE_PRECEDENCE_TOOLS = new Set(['knip', 'dependency-cruiser']);

function presetLoosened({ before, after, scope }: ScopedChange): boolean {
  const from = before === undefined ? DEFAULT_PRESET : textOf(before);
  const to = after === undefined ? DEFAULT_PRESET : textOf(after);
  if (from === to || STRICTER_PRESET.get(from) === to) {
    return false;
  }
  return before !== undefined || to === 'javascript' || !scope.presetRequired;
}

const PROJECT_ANYWHERE_TOOLS = new Set<string | undefined>(['eslint']);

function projectWeight(precedence: readonly string[], tool: string | undefined): number {
  if (PROJECT_ANYWHERE_TOOLS.has(tool) && precedence.includes(PROJECT)) {
    return precedence[0] === PROJECT ? 2 : 1;
  }
  if (precedence[0] !== PROJECT) {
    return 0;
  }
  return precedence.includes(NITPICKER) ? 1 : 2;
}

function additiveWeight(precedence: readonly string[]): number {
  if (!precedence.includes(PROJECT)) {
    return 0;
  }
  return precedence[0] === PROJECT ? 2 : 1;
}

function precedenceLoosened({ before, after, setting }: SettingChange): boolean {
  const tool = setting.split('.')[1];
  const earlier = before === undefined ? DEFAULT_PRECEDENCE : textsOf(before);
  const later = after === undefined ? DEFAULT_PRECEDENCE : textsOf(after);
  if (tool !== undefined && ADDITIVE_PRECEDENCE_TOOLS.has(tool)) {
    return additiveWeight(later) > additiveWeight(earlier);
  }
  return tool !== undefined && UNION_PRECEDENCE_TOOLS.has(tool)
    ? earlier.includes(NITPICKER) && !later.includes(NITPICKER)
    : projectWeight(later, tool) > projectWeight(earlier, tool);
}

function turnedOff(offValue: unknown): (values: SettingValues) => boolean {
  return ({ before, after }) => after === offValue && before !== offValue;
}

const LOOSENING_SETTINGS: readonly SettingRule[] = [
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
  [
    /^conventions\.(?:typescript|kotlin)\.detachedWorkRunners$/u,
    'detached-work-runner-added',
    listGrew,
  ],
];

export function looseningKindOfSetting(
  change: SettingChange,
  scope: PolicyScope,
): string | undefined {
  return LOOSENING_SETTINGS.find(
    ([pattern, , loosens]) => pattern.test(change.setting) && loosens({ ...change, scope }),
  )?.[1];
}

function thresholdChanges(
  baseThresholds: Thresholds = {},
  headThresholds: Thresholds = {},
): ChangePart {
  const keys = [...new Set([...Object.keys(baseThresholds), ...Object.keys(headThresholds)])];
  const moves = keys.map((key) => ({
    key,
    before: baseThresholds[key] ?? THRESHOLD_DEFAULTS[key] ?? Number.NaN,
    after: headThresholds[key] ?? THRESHOLD_DEFAULTS[key] ?? Number.NaN,
  }));
  function described(verb: string, wanted: (move: { before: number; after: number }) => boolean) {
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

function analyzerChanges(
  baseAnalyzers: readonly PolicyAnalyzer[] = [],
  headAnalyzers: readonly PolicyAnalyzer[] = [],
): ChangePart {
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

export function listedChanges(baseConfig: ListedConfig, headConfig: ListedConfig): ChangePart[] {
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
    thresholdChanges(thresholdsOf(baseConfig.thresholds), thresholdsOf(headConfig.thresholds)),
    analyzerChanges(baseConfig.analyzers, headConfig.analyzers),
  ];
}
