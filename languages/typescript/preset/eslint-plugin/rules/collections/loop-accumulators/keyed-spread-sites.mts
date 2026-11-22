import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { calledMember, memberName, outerOf, unwrapped } from '../costly-forms/repeated-runs.mts';
import {
  ancestorsOf,
  constantInitializer,
  contains,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { LOOP_TYPES } from '../spread-shapes.mts';

const { DefinitionType } = TSESLint.Scope;

const SMALL_LITERAL_LIMIT = 16;
const ITERATION_CALLBACKS = new Set(['forEach', 'reduce', 'reduceRight', 'map', 'flatMap']);
const FALLBACK_OPERATORS = new Set(['??', '||']);

type MapWrite = {
  readonly kind: 'map';
  readonly container: TSESTree.Expression;
  readonly key: TSESTree.Expression;
  readonly writeNode: TSESTree.CallExpression;
};

type ObjectWrite = {
  readonly kind: 'object';
  readonly container: TSESTree.Expression;
  readonly key: TSESTree.Expression;
  readonly computed: boolean;
  readonly writeNode: TSESTree.AssignmentExpression;
};

type KeyedWrite = MapWrite | ObjectWrite;

function normalizedText(node: TSESTree.Node, sourceCode: SourceCode): string {
  return sourceCode
    .getTokens(unwrapped(node))
    .map((token) => token.value)
    .join(' ');
}

function isEmptyArray(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  return value.type === AST_NODE_TYPES.ArrayExpression && value.elements.length === 0;
}

function unwrapFallback(node: TSESTree.Node, sourceCode: SourceCode, depth = 0): TSESTree.Node {
  const value = unwrapped(node);
  if (
    value.type === AST_NODE_TYPES.LogicalExpression &&
    FALLBACK_OPERATORS.has(value.operator) &&
    isEmptyArray(value.right)
  ) {
    return unwrapFallback(value.left, sourceCode, depth);
  }
  if (value.type === AST_NODE_TYPES.Identifier && depth < 1) {
    const init = constantInitializer(sourceCode, value);
    if (init !== undefined) {
      return unwrapFallback(init, sourceCode, depth + 1);
    }
  }
  return value;
}

function mapWriteOf(array: TSESTree.ArrayExpression): MapWrite | undefined {
  const outer = outerOf(array);
  const call = outer.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments.length !== 2 ||
    call.arguments[1] !== outer
  ) {
    return undefined;
  }
  const member = calledMember(call);
  const key = call.arguments[0];
  if (
    member === undefined ||
    memberName(member) !== 'set' ||
    key === undefined ||
    key.type === AST_NODE_TYPES.SpreadElement
  ) {
    return undefined;
  }
  return { kind: 'map', container: member.object, key, writeNode: call };
}

function objectWriteOf(array: TSESTree.ArrayExpression): ObjectWrite | undefined {
  const outer = outerOf(array);
  const assignment = outer.parent;
  if (
    assignment?.type !== AST_NODE_TYPES.AssignmentExpression ||
    assignment.operator !== '=' ||
    assignment.right !== outer ||
    assignment.left.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  const { object, property, computed } = assignment.left;
  if (property.type === AST_NODE_TYPES.PrivateIdentifier) {
    return undefined;
  }
  return {
    kind: 'object',
    container: object,
    key: property,
    computed,
    writeNode: assignment,
  };
}

function keyedWriteOf(spread: TSESTree.SpreadElement): KeyedWrite | undefined {
  const array = spread.parent;
  if (array.type !== AST_NODE_TYPES.ArrayExpression) {
    return undefined;
  }
  return mapWriteOf(array) ?? objectWriteOf(array);
}

function matchesMapRead(read: TSESTree.Node, write: MapWrite, sourceCode: SourceCode): boolean {
  if (read.type !== AST_NODE_TYPES.CallExpression || read.arguments.length !== 1) {
    return false;
  }
  const member = calledMember(read);
  const [arg] = read.arguments;
  if (
    member === undefined ||
    memberName(member) !== 'get' ||
    arg === undefined ||
    arg.type === AST_NODE_TYPES.SpreadElement
  ) {
    return false;
  }
  return (
    normalizedText(member.object, sourceCode) === normalizedText(write.container, sourceCode) &&
    normalizedText(arg, sourceCode) === normalizedText(write.key, sourceCode)
  );
}

function matchesObjectRead(
  read: TSESTree.Node,
  write: ObjectWrite,
  sourceCode: SourceCode,
): boolean {
  if (read.type !== AST_NODE_TYPES.MemberExpression || read.computed !== write.computed) {
    return false;
  }
  return (
    normalizedText(read.object, sourceCode) === normalizedText(write.container, sourceCode) &&
    normalizedText(read.property, sourceCode) === normalizedText(write.key, sourceCode)
  );
}

function isIterationCallback(fn: TSESTree.Node): boolean {
  const outer = outerOf(fn);
  const call = outer.parent;
  if (
    call?.type !== AST_NODE_TYPES.CallExpression ||
    !call.arguments.some((argument) => argument === outer)
  ) {
    return false;
  }
  const member = calledMember(call);
  const method = member === undefined ? undefined : memberName(member);
  return method !== undefined && ITERATION_CALLBACKS.has(method);
}

function isSmallLiteralArray(
  node: TSESTree.Node | undefined,
  sourceCode: SourceCode,
  depth = 0,
): boolean {
  if (node === undefined) {
    return false;
  }
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return (
      value.elements.length <= SMALL_LITERAL_LIMIT &&
      value.elements.every(
        (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
      )
    );
  }
  if (value.type === AST_NODE_TYPES.Identifier && depth < 1) {
    return isSmallLiteralArray(constantInitializer(sourceCode, value), sourceCode, depth + 1);
  }
  return false;
}

function iteratesSmallLiteralArray(node: TSESTree.Node, sourceCode: SourceCode): boolean {
  if (node.type === AST_NODE_TYPES.ForOfStatement) {
    return isSmallLiteralArray(node.right, sourceCode);
  }
  if (!isFunction(node)) {
    return false;
  }
  const call = outerOf(node).parent;
  const member = call?.type === AST_NODE_TYPES.CallExpression ? calledMember(call) : undefined;
  return member !== undefined && isSmallLiteralArray(member.object, sourceCode);
}

function containerLocalDeclaration(
  container: TSESTree.Expression,
  sourceCode: SourceCode,
): TSESTree.Node | undefined {
  const value = unwrapped(container);
  if (value.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const definition = variableNamed(sourceCode, value)?.defs[0];
  return definition?.type === DefinitionType.Variable ? definition.node : undefined;
}

function isRepeatingBodyAncestor(
  ancestor: TSESTree.Node,
  child: TSESTree.Node | undefined,
): boolean {
  if (ancestor.type === AST_NODE_TYPES.ForStatement) {
    return child !== ancestor.init;
  }
  if (
    ancestor.type === AST_NODE_TYPES.ForOfStatement ||
    ancestor.type === AST_NODE_TYPES.ForInStatement
  ) {
    return child === ancestor.body;
  }
  return LOOP_TYPES.has(ancestor.type) || (isFunction(ancestor) && isIterationCallback(ancestor));
}

function enclosingRepeats(write: KeyedWrite, sourceCode: SourceCode): TSESTree.Node[] {
  const declaration = containerLocalDeclaration(write.container, sourceCode);
  const chain = [write.writeNode, ...ancestorsOf(write.writeNode)];
  const repeats: TSESTree.Node[] = [];
  for (let index = 1; index < chain.length; index += 1) {
    const ancestor = chain[index];
    if (ancestor === undefined) {
      break;
    }
    if (isFunction(ancestor) && !isIterationCallback(ancestor)) {
      break;
    }
    if (
      isRepeatingBodyAncestor(ancestor, chain[index - 1]) &&
      (declaration === undefined || !contains(ancestor, declaration))
    ) {
      repeats.push(ancestor);
    }
  }
  return repeats;
}

export function isKeyedAccumulatingSpread(
  spread: TSESTree.SpreadElement,
  sourceCode: SourceCode,
): boolean {
  const write = keyedWriteOf(spread);
  if (write === undefined) {
    return false;
  }
  const read = unwrapFallback(spread.argument, sourceCode);
  const matches =
    write.kind === 'map'
      ? matchesMapRead(read, write, sourceCode)
      : matchesObjectRead(read, write, sourceCode);
  if (!matches) {
    return false;
  }
  const repeats = enclosingRepeats(write, sourceCode);
  return (
    repeats.length > 0 && !repeats.every((node) => iteratesSmallLiteralArray(node, sourceCode))
  );
}
