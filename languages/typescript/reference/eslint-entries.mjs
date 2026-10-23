import { ruleEntry } from '../../../shared/reference/entry.mjs';
import { reactRuleIds, reactTestRuleIds } from '../preset/eslint-config/react/react-rules.mjs';
import { i18nRuleIds } from '../preset/eslint-config/i18n/i18n-rules.mjs';
import { readEslintInventory } from './eslint-inventory.mjs';
import { ruleSets } from './rule-sets.mjs';

const GUIDE = 'docs/typescript-strict-preset.md';
const NITPICKER_PREFIX = 'nitpicker/';
const REACT_IDS = new Set([...reactRuleIds, ...reactTestRuleIds]);
const I18N_IDS = new Set(i18nRuleIds);
const TEST_PREFIXES = ['vitest/', 'testing-library/'];
const WHY = {
  nitpicker:
    "One of nitpicker's own ESLint rules. Each names one allowed form of something TypeScript allows several ways, or a defect, and its message says how to fix it.",
  recommended:
    "Part of ESLint's recommended rules, which the TypeScript and JavaScript presets turn on in full.",
  strict:
    "Part of typescript-eslint's strictTypeChecked rules, which the presets turn on in full (type-aware: the rule reads the project's types).",
  vitest:
    'Part of the recommended rules of the Vitest plugin, which the presets turn on for tests.',
  extra: 'Turned on by the preset on top of the ESLint and typescript-eslint rule sets.',
  restricted:
    'The presets list the forms they ban in the options of this rule. Each form has a message that names the allowed form.',
};
const REACT_WHY =
  'The React scope turns on the rules of this plugin, so that components follow the rules of React: hooks, effects, state and the DOM.';
const PLUGIN_WHY = {
  'react-hooks': REACT_WHY,
  'react-x': REACT_WHY,
  'react-dom': REACT_WHY,
  'react-web-api': REACT_WHY,
  'jsx-a11y': 'The React scope turns on the accessibility rules for JSX.',
  'testing-library':
    'The React scope turns on the Testing Library rules for component tests: query by role, user-event, no implementation details.',
  formatjs: 'The i18n scope turns on the rules for internationalized messages.',
  regexp: 'The preset turns on this rule to keep regular expressions safe and readable.',
  functional: 'The preset turns on this rule to keep data immutable.',
  vitest: 'The preset turns on this rule of the Vitest plugin for tests.',
};
const RESTRICTED = /^(?:[\w-]+\/)?no-restricted-/u;
const REACT_SCOPE = 'A TypeScript project with React: `react` in package.json or `react.enabled`.';
const I18N_SCOPE = 'A TypeScript project with `i18n.enabled` or an i18n library.';
const TYPESCRIPT_ONLY_SCOPE = 'The TypeScript preset only.';
const JAVASCRIPT_ONLY_SCOPE = 'The JavaScript preset only.';
const PRESET_VARIANTS = {
  typescript: ['typescript', 'typescript-react'],
  javascript: ['javascript'],
};

function pageOf(id) {
  if (id.startsWith(NITPICKER_PREFIX)) {
    return 'typescript-nitpicker';
  }
  return !id.includes('/') || id.startsWith('@typescript-eslint/')
    ? 'typescript-eslint'
    : 'typescript-plugins';
}

function whyOf(id, sets) {
  if (id.startsWith(NITPICKER_PREFIX)) {
    return WHY.nitpicker;
  }
  if (RESTRICTED.test(id)) {
    return WHY.restricted;
  }
  const own = sets.find(({ rules }) => rules.has(id));
  return own === undefined ? (PLUGIN_WHY[id.split('/')[0]] ?? WHY.extra) : WHY[own.id];
}

function scopeOf(id, presets) {
  if (REACT_IDS.has(id)) {
    return REACT_SCOPE;
  }
  if (I18N_IDS.has(id)) {
    return I18N_SCOPE;
  }
  if (!presets.includes('javascript')) {
    return TYPESCRIPT_ONLY_SCOPE;
  }
  return presets.includes('typescript') ? undefined : JAVASCRIPT_ONLY_SCOPE;
}

function guideAnchorOf(id) {
  if (REACT_IDS.has(id)) {
    return 'react';
  }
  if (I18N_IDS.has(id)) {
    return 'internationalized-messages';
  }
  return TEST_PREFIXES.some((prefix) => id.startsWith(prefix)) ? 'inside-tests' : undefined;
}

function docsOf(id) {
  const anchor = guideAnchorOf(id);
  return [
    { label: 'Strict preset guide', path: GUIDE, ...(anchor === undefined ? {} : { anchor }) },
  ];
}

function formsOf({ forms, messages }, id) {
  if (forms.length > 0) {
    return forms;
  }
  return id.startsWith(NITPICKER_PREFIX) && messages !== undefined
    ? [...new Set(messages)].map((message) => ({ message }))
    : [];
}

function summaryOf({ description, messages }) {
  return description ?? messages?.[0] ?? 'Reported by the rule.';
}

function entryOf(id, byVariant, sets) {
  const facts = Object.values(byVariant).find((found) => found !== undefined);
  const analyzers = Object.fromEntries(
    Object.entries(PRESET_VARIANTS)
      .map(([preset, variants]) => [
        preset,
        [...new Set(variants.flatMap((variant) => byVariant[variant]?.tools ?? []))],
      ])
      .filter(([, tools]) => tools.length > 0),
  );
  const scope = scopeOf(id, Object.keys(analyzers));
  const forms = formsOf(facts, id);
  return ruleEntry({
    tool: 'eslint',
    rule: id,
    findingTools: [...new Set(Object.values(analyzers).flat())],
    page: pageOf(id),
    analyzers,
    summary: summaryOf(facts),
    why: whyOf(id, sets),
    ...(scope === undefined ? {} : { scope }),
    ...(forms.length === 0 ? {} : { forms }),
    ...(facts.url === undefined
      ? {}
      : { links: [{ label: 'Rule documentation', url: facts.url }] }),
    docs: docsOf(id),
    exception: { key: 'exceptions', rule: id },
  });
}

/** The entries of every ESLint rule the TypeScript and JavaScript presets turn on, from the inventory of their configs. */
export function eslintEntries() {
  const inventory = readEslintInventory();
  const sets = ruleSets();
  const ids = [...new Set(Object.values(inventory).flatMap((rules) => Object.keys(rules)))].sort();
  return ids.map((id) =>
    entryOf(
      id,
      Object.fromEntries(Object.entries(inventory).map(([variant, rules]) => [variant, rules[id]])),
      sets,
    ),
  );
}
