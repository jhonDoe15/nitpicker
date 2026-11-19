import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import {
  findVariable,
  resolveConstant,
  stringValue,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { unwrapped } from '../../security/security-values.mts';
import { calleeNameOf, operandsOf } from '../../typed/syntax-views.mts';
import { ts } from '../../typed/typescript-views.mts';
import { fragmentOf, isMarkup } from './html-parts.mts';

type Node = TSESTree.Node;
export type TypeOf = ((node: Node) => TypeScript.Type) | undefined;

const SAFE_CALL = /escape|encode|sanitize|html|markup/iu;
const SAFE_NAME =
  /html|markup|escaped|encoded|sanitized|safe|class|nonce|color|icon|attribute|tag$|css|children|rendered/iu;
const PLAIN_FLAGS = ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;
const NUMBER_CALLS = new Set<string>([
  'Number',
  'parseInt',
  'parseFloat',
  'toFixed',
  'toPrecision',
]);
const NUMBER_PROPERTIES = new Set<string>(['length', 'size', 'count']);
const MAX_DEPTH = 5;

function isPlainType(type: TypeScript.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  return parts.every(
    (part) =>
      (part.flags & PLAIN_FLAGS) !== 0 || (part.isStringLiteral() && !/[<>&"'`]/u.test(part.value)),
  );
}

function isMarkupFragment(node: Node): boolean {
  const fragment = fragmentOf(node);
  return fragment !== undefined && isMarkup(fragment.texts);
}

function isMappedJoin(node: TSESTree.CallExpression): boolean {
  const receiver =
    node.callee.type === AST_NODE_TYPES.MemberExpression ? node.callee.object : undefined;
  return (
    calleeNameOf(node.callee) === 'join' &&
    receiver?.type === AST_NODE_TYPES.CallExpression &&
    calleeNameOf(receiver.callee) === 'map'
  );
}

const ENTITY = /&(?:lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/iu;

function isEntityReplace(node: TSESTree.CallExpression): boolean {
  return (
    ['replace', 'replaceAll'].includes(calleeNameOf(node.callee) ?? '') &&
    node.arguments.some((argument) => ENTITY.test(stringValue(argument) ?? ''))
  );
}

function rootNames(node: Node): string[] {
  const names: string[] = [];
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.CallExpression) {
      names.push(calleeNameOf(current.callee) ?? '');
      pending.push(current.callee);
    } else if (current.type === AST_NODE_TYPES.AwaitExpression) {
      pending.push(current.argument);
    } else if (current.type === AST_NODE_TYPES.MemberExpression) {
      pending.push(current.object);
    }
  }
  return names;
}

function isSafeJoin(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    calleeNameOf(callee) === 'join' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    SAFE_NAME.test(callee.object.name)
  );
}

function safeCall(node: TSESTree.CallExpression): boolean {
  const name = calleeNameOf(node.callee) ?? '';
  const owner =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier
      ? node.callee.object.name
      : '';
  return (
    rootNames(node).some((root) => SAFE_CALL.test(root)) ||
    SAFE_CALL.test(owner) ||
    NUMBER_CALLS.has(name) ||
    isMappedJoin(node) ||
    isSafeJoin(node) ||
    isEntityReplace(node) ||
    owner === 'Math'
  );
}

type Verdict = boolean | readonly Node[];
type SafeEnv = { readonly context: SourceContext; readonly typeOf: TypeOf };

function writeVerdict(context: SourceContext, node: TSESTree.Identifier): Verdict {
  const variable = findVariable(context, node, node.name);
  const declared = variable?.defs.every(
    (definition) =>
      definition.node.type === AST_NODE_TYPES.VariableDeclarator &&
      definition.node.id.type === AST_NODE_TYPES.Identifier,
  );
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  const written = writes.flatMap(({ writeExpr }) => writeExpr ?? []);
  const safe = declared === true && writes.length > 0 && written.length === writes.length;
  return safe ? written : false;
}

function chainNames(node: Node): string[] {
  const names: string[] = [];
  const pending = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      if (!current.computed && current.property.type === AST_NODE_TYPES.Identifier) {
        names.push(current.property.name);
      }
      pending.push(current.object);
    }
  }
  return names;
}

function isSafeMember(target: TSESTree.MemberExpression): boolean {
  return (
    chainNames(target).some((name) => SAFE_NAME.test(name)) ||
    (!target.computed &&
      target.property.type === AST_NODE_TYPES.Identifier &&
      NUMBER_PROPERTIES.has(target.property.name))
  );
}

function compoundOperands(target: Node): readonly Node[] | undefined {
  if (target.type === AST_NODE_TYPES.TemplateLiteral) {
    return isMarkupFragment(target) ? [] : target.expressions;
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return target.operator !== '+' || isMarkupFragment(target) ? [] : operandsOf(target, '+');
  }
  if (target.type === AST_NODE_TYPES.ConditionalExpression) {
    return [target.consequent, target.alternate];
  }
  return target.type === AST_NODE_TYPES.LogicalExpression ? [target.left, target.right] : undefined;
}

function leafVerdict(context: SourceContext, target: Node): Verdict {
  if (target.type === AST_NODE_TYPES.Identifier) {
    return SAFE_NAME.test(target.name) || writeVerdict(context, target);
  }
  if (target.type === AST_NODE_TYPES.MemberExpression) {
    return isSafeMember(target);
  }
  if (target.type === AST_NODE_TYPES.CallExpression) {
    return safeCall(target);
  }
  return target.type === AST_NODE_TYPES.UnaryExpression;
}

function verdictOf(env: SafeEnv, node: Node, depth: number): Verdict {
  const named = unwrapped(node);
  if (named.type === AST_NODE_TYPES.Identifier && SAFE_NAME.test(named.name)) {
    return true;
  }
  const target = unwrapped(resolveConstant(env.context, named));
  if (target === undefined || depth > MAX_DEPTH) {
    return false;
  }
  if (target.type === AST_NODE_TYPES.Literal || stringValue(target) !== undefined) {
    return true;
  }
  if (env.typeOf !== undefined && isPlainType(env.typeOf(target))) {
    return true;
  }
  return compoundOperands(target) ?? leafVerdict(env.context, target);
}

type Pending = { readonly node: Node; readonly depth: number };

function childItems(verdict: Verdict, depth: number): Pending[] {
  return typeof verdict === 'boolean' ? [] : verdict.map((node) => ({ node, depth: depth + 1 }));
}

export function isSafeValue(context: SourceContext, typeOf: TypeOf, node: Node): boolean {
  const env = { context, typeOf };
  const pending: Pending[] = [{ node, depth: 0 }];
  for (const item of pending) {
    const verdict = verdictOf(env, item.node, item.depth);
    if (verdict === false) {
      return false;
    }
    for (const child of childItems(verdict, item.depth)) {
      pending.push(child);
    }
  }
  return true;
}
