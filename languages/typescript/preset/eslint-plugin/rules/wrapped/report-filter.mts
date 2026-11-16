import type { TSESLint, TSESTree } from '@typescript-eslint/utils';

export type Context<Ids extends string, Options extends readonly unknown[]> = Readonly<
  TSESLint.RuleContext<Ids, Options>
>;
export type ReportFilter<Ids extends string, Options extends readonly unknown[]> = (
  descriptor: TSESLint.ReportDescriptor<Ids>,
  context: Context<Ids, Options>,
) => boolean;

function isSyntaxNode(value: TSESTree.Node | TSESTree.Token): value is TSESTree.Node {
  return 'parent' in value;
}

export function reportedNode(
  descriptor: TSESLint.ReportDescriptor<string>,
): TSESTree.Node | undefined {
  const node = 'node' in descriptor ? descriptor.node : undefined;
  return node !== undefined && isSyntaxNode(node) ? node : undefined;
}

export type WrappedDocs = { readonly requiresTypeChecking: boolean };

function isRuleModule<Ids extends string, Options extends readonly unknown[], Docs>(
  value: unknown,
): value is TSESLint.RuleModule<Ids, Options, Docs> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'create' in value &&
    typeof value.create === 'function' &&
    'meta' in value
  );
}

export function ruleModule<Ids extends string, Options extends readonly unknown[], Docs>(
  value: unknown,
  name: string,
): TSESLint.RuleModule<Ids, Options, Docs> {
  if (!isRuleModule<Ids, Options, Docs>(value)) {
    throw new TypeError(`The rule ${name} could not be loaded.`);
  }
  return value;
}

export function pluginRule<Ids extends string, Options extends readonly unknown[], Docs>(
  plugin: object,
  name: string,
): TSESLint.RuleModule<Ids, Options, Docs> {
  const rules: unknown = Reflect.get(plugin, 'rules');
  const rule: unknown =
    typeof rules === 'object' && rules !== null ? Reflect.get(rules, name) : undefined;
  return ruleModule<Ids, Options, Docs>(rule, name);
}

export const createObject: <Prototype extends object>(
  prototype: Prototype,
  properties: PropertyDescriptorMap,
) => Prototype = Object.create;

export function withReportFilter<
  Ids extends string,
  Options extends readonly unknown[],
  Docs = unknown,
>(
  baseRule: TSESLint.RuleModule<Ids, Options, Docs>,
  keepsReport: ReportFilter<Ids, Options>,
  messages: Partial<Record<Ids, string>> = {},
): TSESLint.RuleModule<Ids, Options, Docs> {
  return {
    ...baseRule,
    meta: { ...baseRule.meta, messages: { ...baseRule.meta.messages, ...messages } },
    create(context) {
      return baseRule.create(
        createObject(context, {
          report: {
            value(descriptor: TSESLint.ReportDescriptor<Ids>): void {
              if (keepsReport(descriptor, context)) {
                context.report(descriptor);
              }
            },
          },
        }),
      );
    },
  };
}
