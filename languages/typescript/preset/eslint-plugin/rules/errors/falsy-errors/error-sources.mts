import {
  AST_NODE_TYPES,
  ASTUtils,
  type ParserServicesWithTypeInformation,
  type TSESLint,
  type TSESTree,
} from '@typescript-eslint/utils';
import { ts } from '../../typed/typescript-views.mts';

const UNKNOWN = ts.TypeFlags.Any | ts.TypeFlags.Unknown;
const ERROR_PROPERTIES = new Set<string>(['error', 'cause']);

type Functionish = TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

function propertyName(callee: TSESTree.Node): string | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

function isRejectionHandler(fn: Functionish): boolean {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const name = propertyName(call.callee);
  return (
    (name === 'catch' && call.arguments[0] === fn) || (name === 'then' && call.arguments[1] === fn)
  );
}

function isLooseAnnotation(identifier: TSESTree.Identifier): boolean {
  const annotation = identifier.typeAnnotation?.typeAnnotation;
  return (
    annotation === undefined ||
    annotation.type === AST_NODE_TYPES.TSUnknownKeyword ||
    annotation.type === AST_NODE_TYPES.TSAnyKeyword
  );
}

export function isCaughtValue(sourceCode: TSESLint.SourceCode, node: TSESTree.Identifier): boolean {
  const variable = ASTUtils.findVariable(sourceCode.getScope(node), node);
  const definition = variable?.defs[0];
  if (definition === undefined || definition.name.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (definition.type === 'CatchClause') {
    return definition.node.param === definition.name;
  }
  const owner = definition.node;
  return (
    definition.type === 'Parameter' &&
    (owner.type === AST_NODE_TYPES.FunctionExpression ||
      owner.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
    owner.params[0] === definition.name &&
    isRejectionHandler(owner) &&
    isLooseAnnotation(definition.name)
  );
}

export function isUntypedErrorProperty(
  services: ParserServicesWithTypeInformation | undefined,
  node: TSESTree.Node,
): boolean {
  if (
    services === undefined ||
    node.type !== AST_NODE_TYPES.MemberExpression ||
    node.computed ||
    node.property.type !== AST_NODE_TYPES.Identifier ||
    !ERROR_PROPERTIES.has(node.property.name)
  ) {
    return false;
  }
  const flags = services.getTypeAtLocation(node).flags;
  return (
    (flags & UNKNOWN) !== 0 &&
    ((flags & ts.TypeFlags.Unknown) !== 0 ||
      (services.getTypeAtLocation(node.object).flags & ts.TypeFlags.Any) === 0)
  );
}
