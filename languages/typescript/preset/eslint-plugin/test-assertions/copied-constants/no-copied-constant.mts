import {
  AST_NODE_TYPES,
  AST_TOKEN_TYPES,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { isTestFunctionName, registrationRoot } from '../../rules/analysis/test-code-analysis.mts';
import { chainOf } from '../../rules/typed/node-views.mts';
import {
  byText,
  copiedConstantData,
  copiedConstantTemplate,
  isTrivialValue,
  resolvedFile,
  valueKey,
  type ConstantValue,
} from './copied-constants-views.mts';
import { definingModules } from './defining-modules.mts';
import { exportedConstants } from './exported-constants.mts';
import { importedModule, loadedModule, type ModuleLoad } from './module-loads.mts';

type MessageId = 'copiedNumber' | 'copiedString';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Loadable =
  TSESTree.CallExpression | TSESTree.ImportExpression | TSESTree.TSImportEqualsDeclaration;
type Candidate = TSESTree.Literal | TSESTree.TemplateLiteral;
type FoundLiteral = { readonly node: TSESTree.Node; readonly value: ConstantValue };
type SeenConstant = {
  readonly name: string;
  readonly owner: string;
  readonly mentions: readonly string[];
};
type Keyed = TSESTree.Property | TSESTree.PropertyDefinition | TSESTree.MethodDefinition;

const PIN = 'expect({name}).toBe({value})';
const MORE_TEST_FUNCTIONS = new Set(['context', 'specify', 'bench']);
const PATH_CALLS = new Set(['mock', 'doMock', 'unmock', 'importActual', 'requireActual']);
const STATEMENT = /(?:Statement|Declaration)$/u;

function eslintTemplate(template: string): string {
  return template.replaceAll(/\{(\w+)\}/gu, '{{$1}}');
}

function isValueImport(statement: TSESTree.Node): statement is TSESTree.ImportDeclaration {
  return statement.type === AST_NODE_TYPES.ImportDeclaration && statement.importKind !== 'type';
}

function seenConstants(
  context: Context,
  loads: readonly ModuleLoad[],
): Map<string, SeenConstant[]> {
  const seen = new Map<string, SeenConstant[]>();
  const imports = context.sourceCode.ast.body.filter(isValueImport).map(importedModule);
  for (const { specifier, names, whole } of [...imports, ...loads]) {
    const target = resolvedFile(specifier, context.filename);
    if (target === undefined) {
      continue;
    }
    const only = whole ? undefined : definingModules(target, names.keys(), { root: context.cwd });
    const constants = exportedConstants(target, { root: context.cwd, only });
    for (const [name, value] of constants) {
      const member = name.split('.').at(-1) ?? name;
      const mentions = [member, ...(member === name ? (names.get(name) ?? []) : [])];
      const entry = { name, owner: specifier, mentions };
      seen.set(valueKey(value), [...(seen.get(valueKey(value)) ?? []), entry]);
    }
  }
  return seen;
}

function isOwnRequire(context: Context, node: Loadable): boolean {
  if (!('callee' in node) || node.callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const { name } = node.callee;
  const scopes = chainOf(context.sourceCode.getScope(node), (scope) => scope.upper ?? undefined);
  const variable = scopes.map((scope) => scope.set.get(name)).find((found) => found !== undefined);
  return (variable?.defs.length ?? 0) > 0;
}

function isTestName(node: TSESTree.Node): boolean {
  const call = node.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== node) {
    return false;
  }
  const root = registrationRoot(call.callee);
  return isTestFunctionName(root) || (root !== undefined && MORE_TEST_FUNCTIONS.has(root));
}

function isPathArgument(node: TSESTree.Node): boolean {
  const call = node.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression || call.arguments[0] !== node) {
    return call?.type === AST_NODE_TYPES.ImportExpression;
  }
  const { callee } = call;
  return (
    (callee.type === AST_NODE_TYPES.Identifier && callee.name === 'require') ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      PATH_CALLS.has(callee.property.name))
  );
}

function isKeyed(node: TSESTree.Node): node is Keyed {
  return (
    node.type === AST_NODE_TYPES.Property ||
    node.type === AST_NODE_TYPES.PropertyDefinition ||
    node.type === AST_NODE_TYPES.MethodDefinition
  );
}

function isSkippedPosition(node: TSESTree.Node): boolean {
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  return (
    parent.type === AST_NODE_TYPES.ImportDeclaration ||
    parent.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    parent.type === AST_NODE_TYPES.ExportAllDeclaration ||
    parent.type === AST_NODE_TYPES.ImportExpression ||
    parent.type === AST_NODE_TYPES.ImportAttribute ||
    parent.type === AST_NODE_TYPES.TSLiteralType ||
    parent.type === AST_NODE_TYPES.TSEnumMember ||
    parent.type === AST_NODE_TYPES.TSExternalModuleReference ||
    (isKeyed(parent) && parent.key === node && !parent.computed) ||
    (parent.type === AST_NODE_TYPES.ExpressionStatement && parent.directive !== undefined) ||
    isTestName(node) ||
    isPathArgument(node)
  );
}

function literalOf(node: Candidate): FoundLiteral | undefined {
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.length === 0
      ? { node, value: { kind: 'string', value: node.quasis[0]?.value.cooked ?? '' } }
      : undefined;
  }
  if (typeof node.value === 'string') {
    return { node, value: { kind: 'string', value: node.value } };
  }
  if (typeof node.value !== 'number') {
    return undefined;
  }
  const negated =
    node.parent.type === AST_NODE_TYPES.UnaryExpression && node.parent.operator === '-';
  return negated
    ? { node: node.parent, value: { kind: 'number', value: -node.value } }
    : { node, value: { kind: 'number', value: node.value } };
}

function isStatement(node: TSESTree.Node): boolean {
  return (
    STATEMENT.test(node.type) ||
    (node.parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && node.parent.body === node)
  );
}

function statementOf(node: TSESTree.Node): TSESTree.Node {
  const chain = chainOf(node, (link) => (isStatement(link) ? undefined : link.parent));
  return chain.at(-1) ?? node;
}

function namesConstant(
  context: Context,
  node: TSESTree.Node,
  entries: readonly SeenConstant[],
): boolean {
  const mentioned = new Set(entries.flatMap(({ mentions }) => mentions));
  return context.sourceCode
    .getTokens(statementOf(node))
    .some(({ type, value }) => type === AST_TOKEN_TYPES.Identifier && mentioned.has(value));
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a literal in a test that copies the value of a production constant the test imports.',
    },
    schema: [],
    messages: {
      copiedNumber: eslintTemplate(copiedConstantTemplate('number', PIN)),
      copiedString: eslintTemplate(copiedConstantTemplate('string', PIN)),
    },
  },
  create(context) {
    const literals: FoundLiteral[] = [];
    const loads: ModuleLoad[] = [];
    function collect(candidate: Candidate): void {
      const literal = literalOf(candidate);
      if (
        literal !== undefined &&
        !isTrivialValue(literal.value) &&
        !isSkippedPosition(literal.node)
      ) {
        literals.push(literal);
      }
    }
    function load(node: Loadable): void {
      const loaded = isOwnRequire(context, node) ? undefined : loadedModule(node);
      if (loaded !== undefined) {
        loads.push(loaded);
      }
    }
    function check(seen: Map<string, SeenConstant[]>, literal: FoundLiteral): void {
      const entries = seen.get(valueKey(literal.value));
      if (entries === undefined || namesConstant(context, literal.node, entries)) {
        return;
      }
      const names = [...new Set(entries.map(({ name }) => name))].toSorted(byText);
      const owners = [...new Set(entries.map(({ owner }) => owner))].toSorted(byText);
      context.report({
        node: literal.node,
        messageId: literal.value.kind === 'number' ? 'copiedNumber' : 'copiedString',
        data: copiedConstantData({ names, owner: owners.join(' and '), literal: literal.value }),
      });
    }
    return {
      Literal: collect,
      TemplateLiteral: collect,
      CallExpression: load,
      ImportExpression: load,
      TSImportEqualsDeclaration: load,
      'Program:exit'() {
        if (literals.length > 0) {
          const seen = seenConstants(context, loads);
          for (const literal of literals) {
            check(seen, literal);
          }
        }
      },
    };
  },
};
