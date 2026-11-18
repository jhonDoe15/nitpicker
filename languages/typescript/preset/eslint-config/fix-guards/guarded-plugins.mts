import type { TSESLint } from '@typescript-eslint/utils';
import { FIX_GUARDS } from './fix-guards.mts';
import { GUARDED_FIX_MESSAGE } from './guard-message.mts';
import type { FixGuard } from './guard-types.mts';

type Rule = TSESLint.RuleModule<string, readonly unknown[]>;
type Entry = Readonly<Record<string, unknown>>;

const GUARDED_FIX_TEXT = 'Apply the fix';

type Guards = Readonly<Record<string, Readonly<Record<string, FixGuard>>>>;

function isRule(value: unknown): value is Rule {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function' &&
    'meta' in value
  );
}

const createContext: <Context extends object>(
  context: Context,
  properties: PropertyDescriptorMap,
) => Context = Object.create;

function guardedRule(rule: Rule, { guard }: FixGuard): Rule {
  return {
    ...rule,
    meta: {
      ...rule.meta,
      hasSuggestions: true,
      messages: { ...rule.meta.messages, [GUARDED_FIX_MESSAGE]: GUARDED_FIX_TEXT },
    },
    create(context) {
      return rule.create(
        createContext(context, {
          report: {
            value(descriptor: TSESLint.ReportDescriptor<string>): void {
              context.report(guard(descriptor, context));
            },
          },
        }),
      );
    },
  };
}

function guardedRules(rules: unknown, guards: Readonly<Record<string, FixGuard>>) {
  if (typeof rules !== 'object' || rules === null) {
    return rules;
  }
  const replaced = Object.entries(guards).flatMap(([name, guard]): [string, Rule][] => {
    const rule: unknown = Reflect.get(rules, name);
    return isRule(rule) ? [[name, guardedRule(rule, guard)]] : [];
  });
  return { ...rules, ...Object.fromEntries(replaced) };
}

type Guarding = {
  readonly table: Guards;
  readonly copies: WeakMap<object, object>;
};

function guardedPlugin({ table, copies }: Guarding, namespace: string, plugin: unknown): unknown {
  const guards = table[namespace];
  if (guards === undefined || typeof plugin !== 'object' || plugin === null) {
    return plugin;
  }
  const known = copies.get(plugin);
  if (known !== undefined) {
    return known;
  }
  const guarded = { ...plugin, rules: guardedRules(Reflect.get(plugin, 'rules'), guards) };
  copies.set(plugin, guarded);
  return guarded;
}

function guardedEntry<Config extends Entry>(entry: Config, guarding: Guarding): Config {
  const plugins = entry['plugins'];
  if (typeof plugins !== 'object' || plugins === null) {
    return entry;
  }
  return {
    ...entry,
    plugins: Object.fromEntries(
      Object.entries(plugins).map(([namespace, plugin]) => [
        namespace,
        guardedPlugin(guarding, namespace, plugin),
      ]),
    ),
  };
}

export function guardedEntries<Config extends Entry>(
  entries: readonly Config[],
  table: Guards = FIX_GUARDS,
): Config[] {
  const guarding = { table, copies: new WeakMap<object, object>() };
  return entries.map((entry) => guardedEntry(entry, guarding));
}
