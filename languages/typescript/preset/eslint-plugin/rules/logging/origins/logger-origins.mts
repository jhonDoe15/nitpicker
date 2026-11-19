import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { DEPTHS, type Context, typeServices, unwrapped } from '../../security/security-values.mts';
import { moduleReference } from './module-references.mts';
import { splatOf, type Splat } from './winston-formats.mts';

export type Library = 'pino' | 'bunyan' | 'winston';

const BUNYAN: Library = 'bunyan';
const WINSTON: Library = 'winston';
const UNKNOWN = 'unknown';
export type Logger = { readonly library: Library; readonly splat: Splat };

const { DefinitionType } = TSESLint.Scope;
const DECLARING_PACKAGE = /[\\/]node_modules[\\/](?:@types[\\/])?(pino|bunyan|winston)[\\/]/u;

function factoryLogger(context: Context, call: TSESTree.CallExpression): Logger | undefined {
  const reference = moduleReference(context, call.callee);
  if (reference === undefined) {
    return undefined;
  }
  const { module, name } = reference;
  if (module === 'pino' && (name === 'default' || name === 'pino')) {
    return { library: 'pino', splat: UNKNOWN };
  }
  if (module === BUNYAN && name === 'createLogger') {
    return { library: BUNYAN, splat: UNKNOWN };
  }
  return module === WINSTON && name === 'createLogger'
    ? { library: WINSTON, splat: splatOf(context, call.arguments[0]) }
    : undefined;
}

function declaredLogger(context: Context, node: TSESTree.Node): Logger | undefined {
  const services = typeServices(context);
  if (services === undefined) {
    return undefined;
  }
  const type = services.getTypeAtLocation(node);
  const types = [type, ...(type.isUnion() || type.isIntersection() ? type.types : [])];
  const names = types.flatMap((member) =>
    [member.getSymbol(), member.aliasSymbol].flatMap((symbol) =>
      (symbol?.declarations ?? []).map(
        (declaration) => DECLARING_PACKAGE.exec(declaration.getSourceFile().fileName)?.[1],
      ),
    ),
  );
  const library = names.find((name) => name !== undefined);
  return library === 'pino' || library === BUNYAN || library === WINSTON
    ? { library, splat: UNKNOWN }
    : undefined;
}

function initializerOf(context: Context, node: TSESTree.Identifier): TSESTree.Node | undefined {
  const variable = findVariable(context, node, node.name);
  const [definition] = variable?.defs ?? [];
  const writes = variable?.references.filter((reference) => reference.isWrite()).length;
  return variable?.defs.length === 1 &&
    writes === 1 &&
    definition?.type === DefinitionType.Variable &&
    definition.node.id.type === AST_NODE_TYPES.Identifier
    ? (definition.node.init ?? undefined)
    : undefined;
}

function childReceiver(callee: TSESTree.Node): TSESTree.Node | undefined {
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'child'
    ? callee.object
    : undefined;
}

function nextReceiver(context: Context, node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return initializerOf(context, node);
  }
  return node.type === AST_NODE_TYPES.CallExpression
    ? childReceiver(unwrapped(node.callee))
    : undefined;
}

function syntacticLogger(context: Context, expression: TSESTree.Node): Logger | undefined {
  const nodes = [unwrapped(expression)];
  for (const node of nodes) {
    if (
      node.type === AST_NODE_TYPES.CallExpression &&
      childReceiver(unwrapped(node.callee)) === undefined
    ) {
      return factoryLogger(context, node);
    }
    const next = nextReceiver(context, node);
    if (next === undefined || nodes.length >= DEPTHS.length) {
      return undefined;
    }
    nodes.push(unwrapped(next));
  }
  return undefined;
}

export function loggerOf(context: Context, receiver: TSESTree.Node): Logger | undefined {
  return syntacticLogger(context, receiver) ?? declaredLogger(context, receiver);
}
