const NATIVE_PREFIXES = new Map([
  ['', ['eslint']],
  ['@typescript-eslint', ['typescript', 'eslint']],
  ['vitest', ['vitest']],
]);
export const PARITY_BRIDGED_RULES = new Set([
  'vitest/expect-expect',
  'vitest/no-conditional-expect',
  'vitest/no-conditional-in-test',
  'vitest/valid-expect',
]);
const NEVER_MATCHING_PATTERN = '[^\\s\\S]';
const ESLINT_DEFAULTS_FOR_NATIVE_RULES = new Map([
  [
    'eslint/no-unused-vars',
    {
      argsIgnorePattern: NEVER_MATCHING_PATTERN,
      varsIgnorePattern: NEVER_MATCHING_PATTERN,
      caughtErrorsIgnorePattern: NEVER_MATCHING_PATTERN,
      destructuredArrayIgnorePattern: NEVER_MATCHING_PATTERN,
    },
  ],
]);
const SEVERITIES = new Map([
  [1, 'warn'],
  [2, 'error'],
  ['warn', 'warn'],
  ['error', 'error'],
]);

export function nativeRuleIndex(listedRules) {
  return new Map(
    listedRules.map((rule) => [`${rule.scope}/${rule.value}`, { typeAware: rule.type_aware }]),
  );
}

function splitRuleId(ruleId) {
  const separator = ruleId.lastIndexOf('/');
  return separator === -1
    ? { namespace: '', rule: ruleId }
    : { namespace: ruleId.slice(0, separator), rule: ruleId.slice(separator + 1) };
}

function pluginAlias(namespace) {
  const sanitized = namespace.replace(/^@/, '').replaceAll(/[^a-z0-9-]/g, '-');
  return `js-${sanitized.length === 0 ? 'eslint-core' : sanitized}`;
}

export function translateRule(ruleId, { nativeRules, bridgedRules = new Set() }) {
  const { namespace, rule } = splitRuleId(ruleId);
  const nativeScopes = bridgedRules.has(ruleId) ? [] : (NATIVE_PREFIXES.get(namespace) ?? []);
  const nativeName = nativeScopes
    .map((scope) => `${scope}/${rule}`)
    .find((candidate) => nativeRules.has(candidate));
  if (nativeName !== undefined) {
    return { name: nativeName, typeAware: nativeRules.get(nativeName).typeAware };
  }
  const alias = pluginAlias(namespace);
  return { name: `${alias}/${rule}`, plugin: { namespace, alias }, typeAware: false };
}

export function reportedRuleKey(code) {
  const match = /^(?<scope>[^(]+)\((?<rule>.+)\)$/u.exec(code ?? '');
  return match === null ? undefined : `${match.groups.scope}/${match.groups.rule}`;
}

function oxlintSetting(name, setting) {
  const [severity, ...configured] = Array.isArray(setting) ? setting : [setting];
  const level = SEVERITIES.get(severity);
  if (level === undefined) {
    throw new TypeError(`Unsupported ESLint rule severity: ${String(severity)}`);
  }
  const eslintDefaults = ESLINT_DEFAULTS_FOR_NATIVE_RULES.get(name);
  const options =
    eslintDefaults === undefined ? configured : [{ ...eslintDefaults, ...configured[0] }];
  return options.length === 0 ? level : [level, ...options];
}

function translateGroup(group, context) {
  const rules = {};
  const residualRules = [];
  for (const [ruleId, setting] of Object.entries(group.rules)) {
    const translated = translateRule(ruleId, context);
    if (translated.plugin !== undefined && context.typedPluginRules.has(ruleId)) {
      residualRules.push(ruleId);
      continue;
    }
    rules[translated.name] = oxlintSetting(translated.name, setting);
    context.ruleNames.set(translated.name, ruleId);
    if (translated.plugin !== undefined) addBridgedRule(context.plugins, translated.plugin, ruleId);
    if (translated.typeAware) context.typeAware.value = true;
  }
  return {
    override: { files: group.files.map(escapeGlob), globals: group.globals ?? {}, rules },
    residualRules,
  };
}

function addBridgedRule(plugins, plugin, ruleId) {
  const entry = plugins.get(plugin.alias) ?? { ...plugin, ruleNames: [] };
  const { rule } = splitRuleId(ruleId);
  if (!entry.ruleNames.includes(rule)) entry.ruleNames.push(rule);
  plugins.set(plugin.alias, entry);
}

export function translatePlan(plan, { nativeRules, bridgedRules }) {
  const context = {
    nativeRules,
    bridgedRules,
    typedPluginRules: new Set(plan.typedPluginRules),
    ruleNames: new Map(),
    plugins: new Map(),
    typeAware: { value: false },
  };
  const translated = plan.groups.map((group) => ({ group, ...translateGroup(group, context) }));
  return {
    overrides: translated.map(({ override }) => override),
    residual: translated
      .filter(({ residualRules }) => residualRules.length > 0)
      .map(({ group, residualRules }) => ({ files: group.files, rules: residualRules })),
    ruleNames: context.ruleNames,
    plugins: [...context.plugins.values()],
    typeAware: context.typeAware.value,
  };
}

export function escapeGlob(relativePath) {
  return relativePath.replaceAll(/[\\*?[\]{}!]/g, (character) => `\\${character}`);
}

export function rejectedRuleIds(errorText, ruleNames) {
  const rejected = [...errorText.matchAll(/Invalid configuration for rule `(?<rule>[^`]+)`/gu)].map(
    (match) => match.groups.rule,
  );
  return [...ruleNames]
    .filter(([name]) => rejected.some((rule) => name === rule || name.endsWith(`/${rule}`)))
    .map(([, ruleId]) => ruleId);
}
