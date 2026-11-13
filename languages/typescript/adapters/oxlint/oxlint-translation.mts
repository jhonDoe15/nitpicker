import { ownedNativeName } from './native/owned-native-rules.mts';
import { fieldsOf, listOf } from '../../../../shared/values/readers.mts';
import type {
  BridgedPlugin,
  ListedRule,
  NativeRules,
  OxlintPlan,
  Override,
  Partition,
  PlanGroup,
  PluginRequest,
  RuleMessages,
  Translation,
} from './plan/oxlint-shapes.mts';

type TranslatedRule = {
  readonly name: string;
  readonly plugin?: PluginRequest;
  readonly typeAware: boolean;
};

type RuleContext = {
  readonly nativeRules: NativeRules;
  readonly bridgedRules?: ReadonlySet<string>;
};

type GroupContext = RuleContext & {
  readonly typedPluginRules: ReadonlySet<string>;
  readonly ruleNames: Map<string, string>;
  readonly plugins: Map<string, BridgedPlugin>;
  readonly typeAware: { value: boolean };
};

type TranslatedGroup = { readonly override: Override; readonly residualRules: string[] };

type MessageTemplate = {
  readonly messageId: string;
  readonly pattern: RegExp;
  readonly literalLength: number;
};

const NATIVE_PREFIXES = new Map<string, readonly string[]>([
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
const ESLINT_DEFAULTS_FOR_NATIVE_RULES = new Map<string, Readonly<Record<string, string>>>([
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
const MESSAGE_PLACEHOLDER = /\{\{\s*[^{}\s]+\s*\}\}/gu;
const SEVERITIES = new Map<unknown, string>([
  [1, 'warn'],
  [2, 'error'],
  ['warn', 'warn'],
  ['error', 'error'],
]);

export function nativeRuleIndex(listedRules: readonly ListedRule[]): NativeRules {
  return new Map(
    listedRules.map((rule) => [`${rule.scope}/${rule.value}`, { typeAware: rule.type_aware }]),
  );
}

function splitRuleId(ruleId: string): { readonly namespace: string; readonly rule: string } {
  const separator = ruleId.lastIndexOf('/');
  return separator === -1
    ? { namespace: '', rule: ruleId }
    : { namespace: ruleId.slice(0, separator), rule: ruleId.slice(separator + 1) };
}

function pluginAlias(namespace: string): string {
  const sanitized = namespace.replace(/^@/, '').replaceAll(/[^a-z0-9-]/g, '-');
  return `js-${sanitized.length === 0 ? 'eslint-core' : sanitized}`;
}

export function translateRule(
  ruleId: string,
  { nativeRules, bridgedRules = new Set() }: RuleContext,
): TranslatedRule {
  const { namespace, rule } = splitRuleId(ruleId);
  const candidates = bridgedRules.has(ruleId)
    ? []
    : [
        ...(NATIVE_PREFIXES.get(namespace) ?? []).map((scope) => `${scope}/${rule}`),
        ownedNativeName(ruleId),
      ];
  const nativeName = candidates.find(
    (candidate) => candidate !== undefined && nativeRules.has(candidate),
  );
  const native = nativeName === undefined ? undefined : nativeRules.get(nativeName);
  if (nativeName !== undefined && native !== undefined) {
    return { name: nativeName, typeAware: native.typeAware };
  }
  const alias = pluginAlias(namespace);
  return { name: `${alias}/${rule}`, plugin: { namespace, alias }, typeAware: false };
}

export function reportedRuleKey(code: string | undefined): string | undefined {
  const groups = /^(?<scope>[^(]+)\((?<rule>.+)\)$/u.exec(code ?? '')?.groups;
  return groups === undefined ? undefined : `${String(groups['scope'])}/${String(groups['rule'])}`;
}

function oxlintSetting(name: string, setting: unknown): unknown {
  const [severity, ...configured] = Array.isArray(setting) ? listOf(setting) : [setting];
  const level = SEVERITIES.get(severity);
  if (level === undefined) {
    throw new TypeError(`Unsupported ESLint rule severity: ${String(severity)}`);
  }
  const eslintDefaults = ESLINT_DEFAULTS_FOR_NATIVE_RULES.get(name);
  const options =
    eslintDefaults === undefined ? configured : [{ ...eslintDefaults, ...fieldsOf(configured[0]) }];
  return options.length === 0 ? level : [level, ...options];
}

function translateGroup(group: PlanGroup, context: GroupContext): TranslatedGroup {
  const rules: Record<string, unknown> = {};
  const residualRules: string[] = [];
  for (const [ruleId, setting] of Object.entries(group.rules)) {
    const translated = translateRule(ruleId, context);
    const needsProgram = translated.plugin !== undefined && context.typedPluginRules.has(ruleId);
    if (needsProgram || (group.programRules ?? []).includes(ruleId)) {
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

function addBridgedRule(
  plugins: Map<string, BridgedPlugin>,
  plugin: PluginRequest,
  ruleId: string,
): void {
  const entry = plugins.get(plugin.alias) ?? { ...plugin, ruleNames: [] };
  const { rule } = splitRuleId(ruleId);
  if (!entry.ruleNames.includes(rule)) entry.ruleNames.push(rule);
  plugins.set(plugin.alias, entry);
}

export function translatePlan(
  plan: OxlintPlan,
  { nativeRules, bridgedRules }: Required<RuleContext>,
): Translation {
  const context: GroupContext = {
    nativeRules,
    bridgedRules,
    typedPluginRules: new Set(plan.typedPluginRules),
    ruleNames: new Map(),
    plugins: new Map(),
    typeAware: { value: false },
  };
  const translated = plan.groups.map((group) => ({ group, ...translateGroup(group, context) }));
  return {
    partitions: settingsPartitions(translated),
    residual: translated
      .filter(({ residualRules }) => residualRules.length > 0)
      .map(({ group, residualRules }) => ({ files: group.files, rules: residualRules })),
    ruleNames: context.ruleNames,
    plugins: [...context.plugins.values()],
    typeAware: context.typeAware.value,
  };
}

function settingsPartitions(
  translated: readonly (TranslatedGroup & { readonly group: PlanGroup })[],
): Partition[] {
  const bySettings = Map.groupBy(translated, ({ group }) => JSON.stringify(group.settings ?? {}));
  return [...bySettings.values()].map((members) => ({
    settings: members[0]?.group.settings ?? {},
    files: members.flatMap(({ group }) => group.files),
    overrides: members.map(({ override }) => override),
  }));
}

export function escapeGlob(relativePath: string): string {
  return relativePath.replaceAll(/[\\*?[\]{}!]/g, (character) => `\\${character}`);
}

export function rejectedRuleIds(
  errorText: string,
  ruleNames: ReadonlyMap<string, string>,
): string[] {
  const rejected = [...errorText.matchAll(/Invalid configuration for rule `(?<rule>[^`]+)`/gu)].map(
    (match) => String(match.groups?.['rule']),
  );
  return [...ruleNames]
    .filter(([name]) => rejected.some((rule) => name === rule || name.endsWith(`/${rule}`)))
    .map(([, ruleId]) => ruleId);
}

export function messageIdResolver(
  ruleMessages: RuleMessages = {},
): (ruleId: string, text: string) => string | undefined {
  const templates = new Map(
    Object.entries(ruleMessages).map(([ruleId, messages]) => [
      ruleId,
      compiledTemplates(messages ?? {}),
    ]),
  );
  return (ruleId, text) =>
    templates.get(ruleId)?.find(({ pattern }) => pattern.test(text))?.messageId;
}

function compiledTemplates(messages: Readonly<Record<string, string>>): MessageTemplate[] {
  return Object.entries(messages)
    .map(([messageId, template]) => ({
      messageId,
      pattern: templatePattern(template),
      literalLength: template.replaceAll(MESSAGE_PLACEHOLDER, '').length,
    }))
    .sort((left, right) => right.literalLength - left.literalLength);
}

function templatePattern(template: string): RegExp {
  const literals = template
    .split(MESSAGE_PLACEHOLDER)
    .map((literal) => literal.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${literals.join('[\\s\\S]*?')}$`, 'u');
}
