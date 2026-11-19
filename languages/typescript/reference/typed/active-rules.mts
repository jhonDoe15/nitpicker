import type { ESLint, Linter } from 'eslint';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../shared/values/readers.mts';
import type { RuleFacts, RuleForm } from './inventory-types.mts';

const CORE_PLUGIN = '@';

function isActive(setting: unknown): boolean {
  const severity = Array.isArray(setting) ? listOf(setting)[0] : setting;
  return severity !== 'off' && severity !== 0;
}

function optionObjects(option: unknown): readonly unknown[] {
  if (Array.isArray(option)) {
    return option;
  }
  return option !== null && typeof option === 'object' ? [option] : [];
}

function formsOf(id: string, options: readonly unknown[]): RuleForm[] {
  const entries = options.flatMap(optionObjects);
  if (id === 'vitest/no-restricted-matchers') {
    return entries.flatMap((option) =>
      Object.entries(fieldsOf(option)).map(([name, message]) => ({
        label: name,
        message: String(message),
      })),
    );
  }
  return entries
    .map((option) => fieldsOf(option))
    .flatMap(({ message, name, object, property }) =>
      typeof message === 'string'
        ? [
            {
              message,
              ...(name === undefined ? {} : { label: textOf(name) }),
              ...(object === undefined ? {} : { label: `${textOf(object)}.${textOf(property)}` }),
            },
          ]
        : [],
    );
}

export function unionForms(forms: readonly RuleForm[]): RuleForm[] {
  const seen = new Map(forms.map((form) => [`${form.label ?? ''}\0${form.message}`, form]));
  return [...seen.values()];
}

export function ruleOf(plugins: ReadonlyMap<string, unknown>, id: string): unknown {
  const slash = id.lastIndexOf('/');
  const [plugin, name] =
    slash === -1 ? [CORE_PLUGIN, id] : [id.slice(0, slash), id.slice(slash + 1)];
  return fieldOf(fieldOf(plugins.get(plugin), 'rules'), name);
}

export function metaOf(rule: unknown): Omit<RuleFacts, 'tools' | 'forms'> {
  const meta = fieldOf(rule, 'meta');
  const docs = fieldOf(meta, 'docs');
  const description = fieldOf(docs, 'description');
  const url = fieldOf(docs, 'url');
  const messages = fieldOf(meta, 'messages');
  const fixable = fieldOf(meta, 'fixable');
  return {
    ...(description === undefined ? {} : { description: textOf(description) }),
    ...(url === undefined ? {} : { url: textOf(url) }),
    ...(messages === undefined ? {} : { messages: Object.values(fieldsOf(messages)).map(String) }),
    ...(fieldOf(meta, 'deprecated') === true ? { deprecated: true } : {}),
    ...(fixable === 'code' || fixable === 'whitespace' ? { fixable: true } : {}),
  };
}

export type ConfigEntry = readonly [string, Linter.Config];

export type ActiveRule = {
  readonly id: string;
  readonly tool: string;
  readonly plugins: Readonly<Record<string, unknown>>;
  readonly forms: readonly RuleForm[];
};

export async function activeRules(
  {
    ESLint: eslintClass,
    cwd,
    files,
  }: { ESLint: typeof ESLint; cwd: string; files: readonly string[] },
  [tool, config]: ConfigEntry,
): Promise<ActiveRule[]> {
  const eslint = new eslintClass({ cwd, overrideConfigFile: true, overrideConfig: config });
  const configs: unknown[] = await Promise.all(
    files.map((file) => eslint.calculateConfigForFile(file)),
  );
  return configs.flatMap((calculated) =>
    Object.entries(fieldsOf(fieldOf(calculated, 'rules')))
      .filter(([, setting]) => isActive(setting))
      .map(([id, setting]) => ({
        id,
        tool,
        plugins: fieldsOf(fieldOf(calculated, 'plugins')),
        forms: formsOf(id, Array.isArray(setting) ? setting.slice(1) : []),
      })),
  );
}
