import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { isComponentName as untypedIsComponentName } from '../../../syntax/component-names.mjs';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { variableNamed, type SourceCode } from '../typed/node-views.mts';
import { soleReturnedValue } from '../typed/syntax-views.mts';
import { hasSameFunctionSignature, isAsyncCallee } from './forwarding-signatures.mts';

type Services = ParserServicesWithTypeInformation;
type FunctionNode =
  TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
type ExportDeclaration = TSESTree.ExportNamedDeclaration | TSESTree.ExportDefaultDeclaration;
type Candidate = {
  readonly fn: FunctionNode;
  readonly name: string;
  readonly statement: TSESTree.FunctionDeclaration | TSESTree.VariableDeclaration;
  readonly reportNode: TSESTree.Node;
};
type Docs = { readonly requiresTypeChecking: boolean };

const isComponentName: (name: string | undefined) => boolean = untypedIsComponentName;
const MODULE_SCOPES = new Set<string>(['module', 'global']);

function isExportDeclaration(node: TSESTree.Node): node is ExportDeclaration {
  return (
    node.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function forwardedCall(fn: FunctionNode): TSESTree.Node | undefined {
  const value = soleReturnedValue(fn);
  return fn.async && value?.type === AST_NODE_TYPES.AwaitExpression ? value.argument : value;
}

function identifierName(
  node: TSESTree.Parameter | TSESTree.CallExpressionArgument,
): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return (node.type === AST_NODE_TYPES.RestElement || node.type === AST_NODE_TYPES.SpreadElement) &&
    node.argument.type === AST_NODE_TYPES.Identifier
    ? node.argument.name
    : undefined;
}

function forwardsOwnParameters(fn: FunctionNode, call: TSESTree.CallExpression): boolean {
  const names = fn.params.map(identifierName);
  const forwarded = call.arguments.map(identifierName);
  const sameShape = fn.params.every(
    (parameter, index) =>
      (parameter.type === AST_NODE_TYPES.RestElement) ===
      (call.arguments[index]?.type === AST_NODE_TYPES.SpreadElement),
  );
  return (
    names.length > 0 &&
    names.length === forwarded.length &&
    sameShape &&
    names.every((name, index) => name !== undefined && name === forwarded[index])
  );
}

function isPlainFunction(fn: FunctionNode): boolean {
  return !fn.generator && isAbsent(fn.typeParameters);
}

function isModuleLevel(statement: Candidate['statement']): boolean {
  const owner = isExportDeclaration(statement.parent) ? statement.parent : statement;
  return owner.parent.type === AST_NODE_TYPES.Program;
}

function exportedNameOf(statement: Candidate['statement'], name: string): string | undefined {
  if (statement.parent.type === AST_NODE_TYPES.ExportNamedDeclaration) {
    return name;
  }
  if (statement.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    return 'default';
  }
  return statement.parent.type === AST_NODE_TYPES.Program
    ? statement.parent.body.flatMap((node) => exportsOf(node, name)).at(0)
    : undefined;
}

function exportsOf(node: TSESTree.Node, name: string): string[] {
  if (node.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
    return node.declaration.type === AST_NODE_TYPES.Identifier && node.declaration.name === name
      ? ['default']
      : [];
  }
  if (node.type !== AST_NODE_TYPES.ExportNamedDeclaration || node.source !== null) {
    return [];
  }
  return node.specifiers
    .filter(({ local }) => local.name === name)
    .map(({ exported }) =>
      exported.type === AST_NODE_TYPES.Identifier ? exported.name : exported.value,
    );
}

function isImportableCallee(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
): callee is TSESTree.Identifier {
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, callee);
  return (
    variable !== undefined && variable.defs.length > 0 && MODULE_SCOPES.has(variable.scope.type)
  );
}

function hasOverloads(sourceCode: SourceCode, fn: FunctionNode): boolean {
  const variable = fn.id === null ? undefined : variableNamed(sourceCode, fn.id);
  return variable !== undefined && variable.defs.length > 1;
}

type WrapperScope = {
  readonly context: Readonly<
    TSESLint.RuleContext<'forwardingWrapper' | 'forwardingWrapperLocal', []>
  >;
  readonly sourceCode: SourceCode;
  readonly typed: Services;
};

function forwardedTarget(
  { sourceCode, typed }: WrapperScope,
  { fn, name, statement }: Candidate,
): TSESTree.Identifier | undefined {
  const call = forwardedCall(fn);
  if (
    isComponentName(name) ||
    !isPlainFunction(fn) ||
    !isModuleLevel(statement) ||
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.optional ||
    !isAbsent(call.typeArguments) ||
    !isImportableCallee(sourceCode, call.callee) ||
    call.callee.name === name ||
    !forwardsOwnParameters(fn, call) ||
    hasOverloads(sourceCode, fn) ||
    (fn.async && !isAsyncCallee(typed, call.callee)) ||
    !hasSameFunctionSignature(typed, fn, call.callee)
  ) {
    return undefined;
  }
  return call.callee;
}

function checkWrapper(scope: WrapperScope, candidate: Candidate): void {
  const { name, statement, reportNode } = candidate;
  const target = forwardedTarget(scope, candidate);
  if (target === undefined) {
    return;
  }
  const exported = exportedNameOf(statement, name);
  scope.context.report({
    node: reportNode,
    messageId: exported === undefined ? 'forwardingWrapperLocal' : 'forwardingWrapper',
    data: { name, target: target.name, exported },
  });
}

export const rule: TSESLint.RuleModule<'forwardingWrapper' | 'forwardingWrapperLocal', [], Docs> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow a function that only forwards its parameters to another function',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      forwardingWrapper:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Delete it and export `{{ target }}` in its place with `export { {{ target }} as {{ exported }} }`, or call `{{ target }}` directly.',
      forwardingWrapperLocal:
        '`{{ name }}` only forwards its parameters to `{{ target }}` and has the same parameter and return types. Call `{{ target }}` directly where `{{ name }}` is used and delete the wrapper.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    if (!hasTypeInformation(services)) {
      return {};
    }

    const scope: WrapperScope = { context, sourceCode, typed: services };

    return {
      FunctionDeclaration(node) {
        if (node.id !== null) {
          checkWrapper(scope, { fn: node, name: node.id.name, statement: node, reportNode: node });
        }
      },
      VariableDeclarator(node) {
        const init = node.init;
        if (
          (init?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            init?.type === AST_NODE_TYPES.FunctionExpression) &&
          node.id.type === AST_NODE_TYPES.Identifier &&
          isAbsent(node.id.typeAnnotation)
        ) {
          checkWrapper(scope, {
            fn: init,
            name: node.id.name,
            statement: node.parent,
            reportNode: node,
          });
        }
      },
    };
  },
};
