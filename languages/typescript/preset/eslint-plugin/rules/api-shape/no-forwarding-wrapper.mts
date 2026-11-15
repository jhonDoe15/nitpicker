import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { isComponentName as untypedIsComponentName } from '../../../syntax/component-names.mjs';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { variableNamed, type SourceCode } from '../typed/node-views.mts';
import { ts } from '../typed/typescript-views.mts';

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
type ParameterShape = { type: TypeScript.Type; optional: boolean; rest: boolean };
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

function returnedValue(fn: FunctionNode): TSESTree.Node | undefined {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) {
    return fn.body;
  }
  const [only, ...rest] = fn.body.body;
  return rest.length === 0 && only?.type === AST_NODE_TYPES.ReturnStatement
    ? (only.argument ?? undefined)
    : undefined;
}

function forwardedCall(fn: FunctionNode): TSESTree.Node | undefined {
  const value = returnedValue(fn);
  return fn.async && value?.type === AST_NODE_TYPES.AwaitExpression ? value.argument : value;
}

function parameterName(parameter: TSESTree.Parameter): string | undefined {
  if (parameter.type === AST_NODE_TYPES.Identifier) {
    return parameter.name;
  }
  return parameter.type === AST_NODE_TYPES.RestElement &&
    parameter.argument.type === AST_NODE_TYPES.Identifier
    ? parameter.argument.name
    : undefined;
}

function argumentName(argument: TSESTree.CallExpressionArgument): string | undefined {
  if (argument.type === AST_NODE_TYPES.Identifier) {
    return argument.name;
  }
  return argument.type === AST_NODE_TYPES.SpreadElement &&
    argument.argument.type === AST_NODE_TYPES.Identifier
    ? argument.argument.name
    : undefined;
}

function forwardsOwnParameters(fn: FunctionNode, call: TSESTree.CallExpression): boolean {
  const names = fn.params.map(parameterName);
  const forwarded = call.arguments.map(argumentName);
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

function parameterShape(
  checker: TypeScript.TypeChecker,
  parameter: TypeScript.Symbol,
): ParameterShape {
  const valueDeclaration = parameter.valueDeclaration;
  const declaration =
    valueDeclaration !== undefined && ts.isParameter(valueDeclaration)
      ? valueDeclaration
      : undefined;
  return {
    type: checker.getTypeOfSymbol(parameter),
    optional: declaration !== undefined && checker.isOptionalParameter(declaration),
    rest: declaration?.dotDotDotToken !== undefined,
  };
}

function sameParameters(
  checker: TypeScript.TypeChecker,
  own: TypeScript.Signature,
  target: TypeScript.Signature,
): boolean {
  return (
    own.parameters.length === target.parameters.length &&
    own.parameters.every((parameter, index) => {
      const mine = parameterShape(checker, parameter);
      const other = target.parameters[index];
      const theirs = other === undefined ? undefined : parameterShape(checker, other);
      return (
        theirs !== undefined &&
        mine.type === theirs.type &&
        mine.optional === theirs.optional &&
        mine.rest === theirs.rest
      );
    })
  );
}

function isAsyncDeclaration(declaration: TypeScript.Declaration): boolean {
  const fn = ts.isVariableDeclaration(declaration) ? declaration.initializer : declaration;
  return (
    fn !== undefined &&
    ts.isFunctionLike(fn) &&
    ts.canHaveModifiers(fn) &&
    (ts.getModifiers(fn) ?? []).some(({ kind }) => kind === ts.SyntaxKind.AsyncKeyword)
  );
}

function isAsyncCallee(services: Services, callee: TSESTree.Node): boolean {
  const checker = services.program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(services.esTreeNodeToTSNodeMap.get(callee));
  const target =
    symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  return (target?.declarations ?? []).some(isAsyncDeclaration);
}

function hasSameSignature(
  services: Services,
  wrapper: FunctionNode,
  callee: TSESTree.Node,
): boolean {
  const checker = services.program.getTypeChecker();
  const wrapperSignatures = services.getTypeAtLocation(wrapper).getCallSignatures();
  const calleeSignatures = services.getTypeAtLocation(callee).getCallSignatures();
  const [own] = wrapperSignatures;
  const [target] = calleeSignatures;
  if (
    wrapperSignatures.length !== 1 ||
    calleeSignatures.length !== 1 ||
    own === undefined ||
    target === undefined
  ) {
    return false;
  }
  const predicates = [own, target].filter(
    (signature) => checker.getTypePredicateOfSignature(signature) !== undefined,
  );
  return (
    predicates.length === 0 &&
    sameParameters(checker, own, target) &&
    own.getReturnType() === target.getReturnType()
  );
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

    const typed: Services = services;

    function check({ fn, name, statement, reportNode }: Candidate): void {
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
        !hasSameSignature(typed, fn, call.callee)
      ) {
        return;
      }
      const exported = exportedNameOf(statement, name);
      context.report({
        node: reportNode,
        messageId: exported === undefined ? 'forwardingWrapperLocal' : 'forwardingWrapper',
        data: { name, target: call.callee.name, exported },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id !== null) {
          check({ fn: node, name: node.id.name, statement: node, reportNode: node });
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
          check({ fn: init, name: node.id.name, statement: node.parent, reportNode: node });
        }
      },
    };
  },
};
