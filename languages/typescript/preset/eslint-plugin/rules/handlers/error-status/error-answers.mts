import { AST_NODE_TYPES, ASTUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { inside } from '../../decided/syntax.mts';
import { ancestorsOf, chainOf, type SourceCode } from '../../typed/node-views.mts';
import { isFunction, unwrapOf, TYPE_WRAPPERS } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

const STATUS = 'status';
const RESPONSE = 'response';
const RESPONSE_NAMES = new Set(['res', RESPONSE, 'reply']);
const CONTEXT_NAMES = new Set(['c', 'ctx', 'context']);
const SENDERS = new Set(['json', 'send']);
const STATUS_CALLS = new Set([STATUS, 'sendStatus', 'code', 'writeHead']);
const STATUS_FIELDS = new Set([STATUS, 'statusCode']);
const ERROR_KEYS = new Set(['error', 'errors', 'err']);
const OUTCOME_KEYS = new Set([
  STATUS,
  'statusCode',
  'code',
  'success',
  'ok',
  'data',
  'result',
  'jsonrpc',
  'id',
]);
const STATIC_OWNERS = new Set(['NextResponse', 'Response']);

type Member = TSESTree.MemberExpression & { readonly property: TSESTree.Identifier };
export type Answer = {
  readonly body: TSESTree.Node | undefined;
  readonly settings: TSESTree.Node | undefined;
  readonly root: TSESTree.Identifier;
  readonly kind: 'static' | typeof RESPONSE | 'context';
};

function isNamedMember(node: TSESTree.Node): node is Member {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  );
}

function namedMember(node: TSESTree.Node): Member | undefined {
  return isNamedMember(node) ? node : undefined;
}

function chainedReceiver(link: TSESTree.Node): TSESTree.Node | undefined {
  return link.type === AST_NODE_TYPES.CallExpression ? namedMember(link.callee)?.object : undefined;
}

function definitionOf(
  code: SourceCode,
  identifier: TSESTree.Identifier,
): TSESLint.Scope.Definition | undefined {
  return ASTUtils.findVariable(code.getScope(identifier), identifier)?.defs[0];
}

function isImportedFrom(
  definition: TSESLint.Scope.Definition | undefined,
  module: string,
): boolean {
  return (
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    definition.parent.source.value === module
  );
}

function isStaticOwner(code: SourceCode, owner: TSESTree.Identifier): boolean {
  const definition = definitionOf(code, owner);
  return owner.name === 'Response'
    ? definition === undefined
    : isImportedFrom(definition, 'next/server');
}

function importsHono(code: SourceCode): boolean {
  return code.ast.body.some(
    (statement) =>
      statement.type === AST_NODE_TYPES.ImportDeclaration &&
      /^(?:hono$|hono\/|@hono\/)/u.test(statement.source.value),
  );
}

function kindOf(
  code: SourceCode,
  root: TSESTree.Identifier,
  chained: boolean,
): Answer['kind'] | undefined {
  if (!chained && STATIC_OWNERS.has(root.name)) {
    return isStaticOwner(code, root) ? 'static' : undefined;
  }
  if (definitionOf(code, root)?.type !== DefinitionType.Parameter) {
    return undefined;
  }
  if (RESPONSE_NAMES.has(root.name)) {
    return RESPONSE;
  }
  return !chained && CONTEXT_NAMES.has(root.name) && importsHono(code) ? 'context' : undefined;
}

/** The response a call sends when it gives no status of its own in the call chain. */
export function answerOf(code: SourceCode, call: TSESTree.CallExpression): Answer | undefined {
  const callee = namedMember(call.callee);
  if (callee === undefined || !SENDERS.has(callee.property.name)) {
    return undefined;
  }
  const links = chainOf<TSESTree.Node>(callee.object, chainedReceiver);
  const root = links.at(-1);
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const kind = kindOf(code, root, links.length > 1);
  if (kind === undefined || (kind !== RESPONSE && callee.property.name !== 'json')) {
    return undefined;
  }
  const names = links.map((link) =>
    link.type === AST_NODE_TYPES.CallExpression ? namedMember(link.callee)?.property.name : '',
  );
  return names.some((name) => name !== undefined && STATUS_CALLS.has(name))
    ? undefined
    : { body: call.arguments[0], settings: call.arguments[1], root, kind };
}

function keyOf(property: TSESTree.ObjectLiteralElement): string | undefined {
  if (property.type !== AST_NODE_TYPES.Property || property.computed) {
    return undefined;
  }
  if (property.key.type === AST_NODE_TYPES.Identifier) {
    return property.key.name;
  }
  return String(property.key.value);
}

function isAbsent(value: TSESTree.Node): boolean {
  return (
    (value.type === AST_NODE_TYPES.Literal && (value.value === null || value.value === false)) ||
    (value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined') ||
    (value.type === AST_NODE_TYPES.ArrayExpression && value.elements.length === 0)
  );
}

/** Whether `body` is an object literal that only reports a failure: no outcome field of its own. */
export function isErrorBody(body: TSESTree.Node | undefined): boolean {
  const literal = body === undefined ? undefined : unwrapOf(body, TYPE_WRAPPERS);
  if (literal?.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  const keys = literal.properties.map(keyOf);
  return (
    keys.every((key) => key !== undefined && !OUTCOME_KEYS.has(key)) &&
    literal.properties.some(
      (property, index) =>
        ERROR_KEYS.has(keys[index] ?? '') &&
        property.type === AST_NODE_TYPES.Property &&
        !isAbsent(property.value),
    )
  );
}

/** Whether the second argument of a static `json` call leaves the status at its default. */
export function leavesStatus(settings: TSESTree.Node | undefined): boolean {
  if (settings === undefined) {
    return true;
  }
  return (
    settings.type === AST_NODE_TYPES.ObjectExpression &&
    settings.properties.every((property) => {
      const key = keyOf(property);
      return key !== undefined && !STATUS_FIELDS.has(key);
    })
  );
}

function setsStatus(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const name = namedMember(node.callee)?.property.name;
    return name !== undefined && STATUS_CALLS.has(name);
  }
  if (node.type !== AST_NODE_TYPES.AssignmentExpression) {
    return false;
  }
  const name = namedMember(node.left)?.property.name;
  return name !== undefined && STATUS_FIELDS.has(name);
}

function isBareStatus(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ExpressionStatement && setsStatus(node.expression);
}

/** Whether `clause` sets a response status, or the function around it sets one as a statement. */
export function statusSetAround(clause: TSESTree.CatchClause): boolean {
  const owner = ancestorsOf(clause).find(isFunction) ?? clause;
  return [...inside(clause.body)].some(setsStatus) || [...inside(owner)].some(isBareStatus);
}

/** The `catch` clause whose block holds `node`, in the same function. */
export function catchAround(node: TSESTree.Node): TSESTree.CatchClause | undefined {
  const path = ancestorsOf(node);
  const boundary = path.findIndex(isFunction);
  const reach = boundary === -1 ? path : path.slice(0, boundary);
  return reach.find((ancestor) => ancestor.type === AST_NODE_TYPES.CatchClause);
}
