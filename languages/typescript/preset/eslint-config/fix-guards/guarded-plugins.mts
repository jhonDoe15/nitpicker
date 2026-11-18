import type { TSESLint } from '@typescript-eslint/utils';
import { FIX_GUARDS } from './fix-guards.mts';
import { GUARDED_FIX_MESSAGE, type FixGuard } from './guard-types.mts';

type Rule = TSESLint.RuleModule<string, readonly unknown[], unknown>;
type Entry = Readonly<Record<string, unknown>>;

const GUARDED_FIX_TEXT = 'Apply the fix';

type Guards = Readonly<Record<string, Readonly<Record<string, FixGuard>>>>;

const guardedPlugins = new WeakMap<Guards, WeakMap<object, object>>();

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

export function guardedRule(rule: Rule, { guard }: FixGuard): Rule {
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

function cacheOf(table: Guards): WeakMap<object, object> {
  const known = guardedPlugins.get(table);
  if (known !== undefined) {
    return known;
  }
  const created = new WeakMap<object, object>();
  guardedPlugins.set(table, created);
  return created;
}

function guardedPlugin(table: Guards, namespace: string, plugin: unknown): unknown {
  const guards = table[namespace];
  if (guards === undefined || typeof plugin !== 'object' || plugin === null) {
    return plugin;
  }
  const cache = cacheOf(table);
  const known = cache.get(plugin);
  if (known !== undefined) {
    return known;
  }
  const guarded = { ...plugin, rules: guardedRules(Reflect.get(plugin, 'rules'), guards) };
  cache.set(plugin, guarded);
  return guarded;
}

export function guardedEntry(entry: Entry, table: Guards = FIX_GUARDS): Entry {
  const plugins = entry['plugins'];
  if (typeof plugins !== 'object' || plugins === null) {
    return entry;
  }
  return {
    ...entry,
    plugins: Object.fromEntries(
      Object.entries(plugins).map(([namespace, plugin]) => [
        namespace,
        guardedPlugin(table, namespace, plugin),
      ]),
    ),
  };
}
