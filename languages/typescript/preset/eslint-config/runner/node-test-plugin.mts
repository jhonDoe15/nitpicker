import type { Rule, Scope, SourceCode } from 'eslint';
import { fieldOf } from '../../../../../shared/values/readers.mts';

type Definition = Scope.Definition;
type RuleSource = { readonly rules: Readonly<Record<string, Rule.RuleModule>> };

const MODULE = 'node:test';
const EXPORTED_NAME = 'test';

export function hasFields(value: unknown, names: readonly string[]): boolean {
  return typeof value === 'object' && value !== null && names.every((name) => name in value);
}

function isDefinition(value: unknown): value is Definition {
  return hasFields(value, ['type', 'node', 'name']);
}

function isVariable(value: unknown): value is Scope.Variable {
  return hasFields(value, ['defs', 'name', 'scope']);
}

function isScope(value: unknown): value is Scope.Scope {
  return hasFields(value, ['set', 'upper', 'variables']);
}

function isSourceCode(value: unknown): value is SourceCode {
  return hasFields(value, ['getScope', 'text']);
}

function isContext(value: unknown): value is Rule.RuleContext {
  return hasFields(value, ['report', 'sourceCode']);
}

function derived<Base extends object, Result extends Base>(
  base: Base,
  properties: PropertyDescriptorMap,
  matches: (value: unknown) => value is Result,
): Result {
  const created: unknown = Object.create(base, properties);
  if (!matches(created)) {
    throw new TypeError('The wrapped lint object lost its shape.');
  }
  return created;
}

function isDefaultImport(definition: Definition): boolean {
  return (
    definition.type === 'ImportBinding' &&
    definition.node.type === 'ImportDefaultSpecifier' &&
    definition.parent.source.value === MODULE
  );
}

function isWholeRequire(definition: Definition): boolean {
  const init = definition.type === 'Variable' ? definition.node.init : undefined;
  const first = init?.type === 'CallExpression' ? init.arguments[0] : undefined;
  return (
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    first?.type === 'Literal' &&
    first.value === MODULE &&
    definition.type === 'Variable' &&
    definition.node.id.type === 'Identifier'
  );
}

function asNamedImport(definition: Definition): Definition {
  const local = fieldOf(definition.node, 'local');
  const specifier = {
    type: 'ImportSpecifier',
    imported: { type: 'Identifier', name: EXPORTED_NAME },
    local,
  };
  return derived(definition, { node: { value: specifier } }, isDefinition);
}

function asDestructuredRequire(definition: Definition): Definition {
  const parent = { type: 'Property', key: { type: 'Identifier', name: EXPORTED_NAME } };
  const name: unknown = Object.create(definition.name, { parent: { value: parent } });
  return derived(definition, { name: { value: name } }, isDefinition);
}

function normalizedDefinition(definition: Definition): Definition {
  if (isDefaultImport(definition)) {
    return asNamedImport(definition);
  }
  return isWholeRequire(definition) ? asDestructuredRequire(definition) : definition;
}

function normalizedVariable(variable: Scope.Variable | undefined): Scope.Variable | undefined {
  if (variable === undefined) {
    return variable;
  }
  return derived(
    variable,
    { defs: { value: variable.defs.map(normalizedDefinition) } },
    isVariable,
  );
}

function normalizedScope(scope: Scope.Scope['upper']): Scope.Scope['upper'] {
  if (scope === null) {
    return scope;
  }
  const set: unknown = Object.create(scope.set, {
    get: { value: (name: string) => normalizedVariable(scope.set.get(name)) },
  });
  return derived(
    scope,
    { set: { value: set }, upper: { get: () => normalizedScope(scope.upper) } },
    isScope,
  );
}

function normalizedSourceCode(sourceCode: SourceCode): SourceCode {
  return derived(
    sourceCode,
    { getScope: { value: (node: Rule.Node) => normalizedScope(sourceCode.getScope(node)) } },
    isSourceCode,
  );
}

function normalizedContext(context: Rule.RuleContext): Rule.RuleContext {
  return derived(
    context,
    { sourceCode: { value: normalizedSourceCode(context.sourceCode) } },
    isContext,
  );
}

function withNodeTestImports(rule: Rule.RuleModule | undefined): Rule.RuleModule {
  if (rule === undefined) {
    throw new TypeError('The jest plugin lacks a rule the node:test plugin wraps.');
  }
  return { ...rule, create: (context) => rule.create(normalizedContext(context)) };
}

export function nodeTestPlugin(
  jestPlugin: RuleSource,
  ruleNames: readonly string[],
): { rules: Record<string, Rule.RuleModule> } {
  return {
    rules: Object.fromEntries(
      ruleNames.map((name) => [name, withNodeTestImports(jestPlugin.rules[name])]),
    ),
  };
}
