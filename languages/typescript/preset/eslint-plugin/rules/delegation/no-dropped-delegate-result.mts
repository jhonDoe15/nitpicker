import {
  AST_NODE_TYPES,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { unwrapOf } from '../typed/syntax-views.mts';
import { hasTypeInformation } from '../promises/cannot-reject.mts';
import { partsOf } from '../analysis/narrowing/type-parts.mts';
import {
  enclosingNames,
  isAccessorOrConstructor,
  isHookName,
  type FunctionLike,
} from './enclosing-names.mts';

type Delegation = { readonly callee: TSESTree.Node; readonly name: string };

const FORWARDERS = new Set(['call', 'apply']);
const VOID_FLAGS = ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never;
const WRAPPERS = [
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.ChainExpression,
];

function stripped(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
}

function propertyName(member: TSESTree.MemberExpression): string | undefined {
  if (member.property.type === AST_NODE_TYPES.Identifier && !member.computed) {
    return member.property.name;
  }
  return member.property.type === AST_NODE_TYPES.Literal &&
    typeof member.property.value === 'string'
    ? member.property.value
    : undefined;
}

function delegationOf(call: TSESTree.CallExpression): Delegation | undefined {
  const callee = stripped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const direct = propertyName(callee);
  const object = stripped(callee.object);
  if (
    direct !== undefined &&
    FORWARDERS.has(direct) &&
    object.type === AST_NODE_TYPES.MemberExpression
  ) {
    const name = propertyName(object);
    return name === undefined ? undefined : { callee: object, name };
  }
  return direct === undefined ? undefined : { callee, name: direct };
}

function isThisReceiver(callee: TSESTree.Node): boolean {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    stripped(callee.object).type === AST_NODE_TYPES.ThisExpression
  );
}

function isVoidAnnotation(node: TSESTree.TSTypeAnnotation | undefined): boolean {
  const type = node?.typeAnnotation;
  if (type === undefined) {
    return false;
  }
  if (
    type.type === AST_NODE_TYPES.TSVoidKeyword ||
    type.type === AST_NODE_TYPES.TSUndefinedKeyword ||
    type.type === AST_NODE_TYPES.TSNeverKeyword
  ) {
    return true;
  }
  const [argument] =
    type.type === AST_NODE_TYPES.TSTypeReference ? (type.typeArguments?.params ?? []) : [];
  return (
    argument !== undefined &&
    (argument.type === AST_NODE_TYPES.TSVoidKeyword ||
      argument.type === AST_NODE_TYPES.TSUndefinedKeyword)
  );
}

function buildsArguments(statement: TSESTree.Statement): boolean {
  return (
    statement.type === AST_NODE_TYPES.VariableDeclaration ||
    statement.type === AST_NODE_TYPES.ExpressionStatement
  );
}

function enclosingFunction(statement: TSESTree.ExpressionStatement): FunctionLike | undefined {
  const block = statement.parent;
  if (block.type !== AST_NODE_TYPES.BlockStatement) {
    return undefined;
  }
  const owner = block.parent;
  const isFunction =
    owner.type === AST_NODE_TYPES.FunctionDeclaration ||
    owner.type === AST_NODE_TYPES.FunctionExpression ||
    owner.type === AST_NODE_TYPES.ArrowFunctionExpression;
  const last = block.body.at(-1) === statement;
  return isFunction && last && block.body.slice(0, -1).every(buildsArguments) ? owner : undefined;
}

const LIBRARY_MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'set',
  'add',
  'delete',
  'clear',
  'on',
  'once',
  'off',
  'emit',
  'addListener',
  'removeListener',
  'write',
  'end',
  'close',
  'destroy',
]);

function isInheritedReceiver(callee: TSESTree.Node): boolean {
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const object = stripped(callee.object);
  if (object.type === AST_NODE_TYPES.Super) {
    return true;
  }
  return (
    object.type === AST_NODE_TYPES.MemberExpression &&
    stripped(object.object).type === AST_NODE_TYPES.ThisExpression &&
    propertyName(object) === 'constructor'
  );
}

function isUnresolved(type: TypeScript.Type): boolean {
  const intrinsic: unknown = Reflect.get(type, 'intrinsicName');
  return (type.flags & ts.TypeFlags.Unknown) !== 0 || intrinsic === 'error';
}

function returnsNothing(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  const awaited = checker.getAwaitedType(type) ?? type;
  return partsOf(awaited).every((part) => (part.flags & VOID_FLAGS) !== 0);
}

type TypeView =
  | {
      readonly typed: ParserServicesWithTypeInformation;
      readonly checker: TypeScript.TypeChecker;
    }
  | undefined;

function declaredInLibrary(view: TypeView, callee: TSESTree.Node): boolean {
  if (view === undefined || callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const { typed, checker } = view;
  const symbol = checker.getSymbolAtLocation(typed.esTreeNodeToTSNodeMap.get(callee.property));
  return (symbol?.declarations ?? []).some((declaration) => {
    const file = declaration.getSourceFile();
    return (
      typed.program.isSourceFileDefaultLibrary(file) ||
      typed.program.isSourceFileFromExternalLibrary(file) ||
      file.isDeclarationFile
    );
  });
}

function returnsNothingAt(view: TypeView, node: TSESTree.Node, unresolvedCounts = false): boolean {
  if (view === undefined) {
    return false;
  }
  const type = view.checker.getTypeAtLocation(view.typed.esTreeNodeToTSNodeMap.get(node));
  return returnsNothing(view.checker, type) || (unresolvedCounts && isUnresolved(type));
}

function delegateIgnorable(view: TypeView, node: TSESTree.Node, delegation: Delegation): boolean {
  if (isInheritedReceiver(delegation.callee)) {
    return returnsNothingAt(view, node);
  }
  if (view === undefined) {
    return LIBRARY_MUTATORS.has(delegation.name);
  }
  return declaredInLibrary(view, delegation.callee) || returnsNothingAt(view, node, true);
}

function calledExpression(statement: TSESTree.ExpressionStatement): TSESTree.Node {
  const expression = stripped(statement.expression);
  return expression.type === AST_NODE_TYPES.AwaitExpression
    ? stripped(expression.argument)
    : expression;
}

function droppedDelegation(
  view: TypeView,
  statement: TSESTree.ExpressionStatement,
): Delegation | undefined {
  const call = calledExpression(statement);
  const delegation = call.type === AST_NODE_TYPES.CallExpression ? delegationOf(call) : undefined;
  const owner = delegation === undefined ? undefined : enclosingFunction(statement);
  if (delegation === undefined || owner === undefined || isThisReceiver(delegation.callee)) {
    return undefined;
  }
  const names = enclosingNames(owner);
  const allowed =
    !names.includes(delegation.name) ||
    names.some(isHookName) ||
    owner.generator ||
    isAccessorOrConstructor(owner) ||
    isVoidAnnotation(owner.returnType) ||
    delegateIgnorable(view, stripped(statement.expression), delegation);
  return allowed ? undefined : delegation;
}

export const rule: TSESLint.RuleModule<
  'droppedDelegateResult',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a method that delegates to a same-named method and drops its result',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      droppedDelegateResult:
        '`{{name}}` delegates to `{{callee}}` but drops its result; return it.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    const view: TypeView = hasTypeInformation(services)
      ? { typed: services, checker: services.program.getTypeChecker() }
      : undefined;
    return {
      ExpressionStatement(statement) {
        const delegation = droppedDelegation(view, statement);
        if (delegation !== undefined) {
          context.report({
            node: statement,
            messageId: 'droppedDelegateResult',
            data: { name: delegation.name, callee: sourceCode.getText(delegation.callee) },
          });
        }
      },
    };
  },
};
