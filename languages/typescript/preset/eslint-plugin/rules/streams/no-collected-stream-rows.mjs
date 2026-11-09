import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf, contains, variableNamed } from '../analysis/ancestry.mjs';
import { isStreamSource, unwrapped } from './stream-sources.mjs';

const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const APPENDS = new Set(['push', 'unshift']);
const BREAK_TARGETS = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
]);
const DRAINS = new Set(['splice', 'pop', 'shift']);
const ASSEMBLERS = new Set(['concat', 'join']);
const ASSEMBLER_TYPES = new Set(['Blob', 'Buffer', 'File', 'Uint8Array']);

const MESSAGE =
  '`{{name}}` collects every item of this stream, generator or cursor and is used only after the loop, so the whole result is held in memory at once, which is what streaming avoids and what runs out of memory on a large input. Flush a fixed-size batch inside the loop (`if (batch.length >= 500) { await save(batch.splice(0)); }`) and the rest once after it. An exception fits only for a source that always stays small.';

function childrenOf(node) {
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((child) => typeof child?.type === 'string');
}

function identifiersIn(node, types = ['Identifier']) {
  return [...depthFirst(node, childrenOf)].filter((child) => types.includes(child.type));
}

function memberCall(identifier) {
  const member = identifier.parent;
  if (member?.type !== 'MemberExpression' || member.object !== identifier || member.computed) {
    return undefined;
  }
  const call = member.parent;
  const name = member.property.type === 'Identifier' ? member.property.name : undefined;
  return {
    name,
    member,
    call: call?.type === 'CallExpression' && call.callee === member ? call : undefined,
  };
}

function ownLoopCode(node, loop) {
  return ancestorsOf(node)
    .slice(0, ancestorsOf(node).indexOf(loop))
    .every((ancestor) => !FUNCTIONS.has(ancestor.type));
}

function exitsLoop(statement, loop) {
  if (statement.type === 'ReturnStatement') {
    return true;
  }
  if (statement.type !== 'BreakStatement') {
    return false;
  }
  const target = ancestorsOf(statement).find((ancestor) => BREAK_TARGETS.has(ancestor.type));
  return statement.label !== null || target === loop;
}

function exitsEarly(loop) {
  return identifiersIn(loop.body, ['ReturnStatement', 'BreakStatement']).some(
    (statement) => ownLoopCode(statement, loop) && exitsLoop(statement, loop),
  );
}

function isArrayLiteral(init) {
  const value = init === null || init === undefined ? undefined : unwrapped(init);
  return value?.type === 'ArrayExpression';
}

function isSpreadAppend(identifier, name) {
  const assignment = identifier.parent;
  const value =
    assignment.type === 'AssignmentExpression' ? unwrapped(assignment.right) : undefined;
  return (
    value?.type === 'ArrayExpression' &&
    value.elements.some(
      (element) =>
        element?.type === 'SpreadElement' &&
        unwrapped(element.argument).type === 'Identifier' &&
        unwrapped(element.argument).name === name,
    )
  );
}

function isDrain(reference, name) {
  const { identifier } = reference;
  if (reference.isWrite()) {
    return !isSpreadAppend(identifier, name);
  }
  const use = memberCall(identifier);
  if (use?.call !== undefined) {
    return DRAINS.has(use.name);
  }
  const assignment = use?.member.parent;
  return (
    use?.name === 'length' &&
    assignment?.type === 'AssignmentExpression' &&
    assignment.left === use.member
  );
}

function isAppend(reference) {
  return !reference.isWrite() && APPENDS.has(memberCall(reference.identifier)?.name);
}

function assemblesBytes(identifier) {
  const use = memberCall(identifier);
  if (ASSEMBLERS.has(use?.name) && use.call !== undefined) {
    return true;
  }
  const call = identifier.parent;
  if (
    !['CallExpression', 'NewExpression'].includes(call?.type) ||
    !call.arguments.includes(identifier)
  ) {
    return false;
  }
  const callee = unwrapped(call.callee);
  const owner = callee.type === 'MemberExpression' ? unwrapped(callee.object) : callee;
  return owner.type === 'Identifier' && ASSEMBLER_TYPES.has(owner.name);
}

function collectedArray(sourceCode, loop, reference) {
  const { identifier } = reference;
  const variable = variableNamed(sourceCode, identifier);
  const definition = variable?.defs[0];
  if (
    definition?.type !== 'Variable' ||
    contains(loop, definition.node) ||
    !isArrayLiteral(definition.node.init)
  ) {
    return undefined;
  }
  const references = variable.references.filter((candidate) => !candidate.init);
  const inLoop = references.filter((candidate) => contains(loop, candidate.identifier));
  const after = references.filter((candidate) => candidate.identifier.range[0] > loop.range[1]);
  if (inLoop.some((candidate) => isDrain(candidate, identifier.name)) || after.length === 0) {
    return undefined;
  }
  return after.some((candidate) => assemblesBytes(candidate.identifier)) ? undefined : variable;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow collecting every item of a stream, generator or cursor into one array that is used only after the loop',
    },
    schema: [],
    messages: { collectedStream: MESSAGE },
  },
  create(context) {
    const { sourceCode } = context;
    function appendedArray(loop, identifier) {
      const variable = variableNamed(sourceCode, identifier);
      const reference = variable?.references.find(
        (candidate) => candidate.identifier === identifier,
      );
      const appends =
        reference !== undefined && ownLoopCode(identifier, loop) && isAppend(reference);
      return appends ? collectedArray(sourceCode, loop, reference) : undefined;
    }
    return {
      'ForOfStatement[await=true]'(loop) {
        if (!isStreamSource(sourceCode, loop.right) || exitsEarly(loop)) {
          return;
        }
        const firstAppends = new Map();
        for (const identifier of identifiersIn(loop.body)) {
          const variable = appendedArray(loop, identifier);
          if (variable !== undefined && !firstAppends.has(variable)) {
            firstAppends.set(variable, identifier);
          }
        }
        for (const identifier of firstAppends.values()) {
          context.report({
            node: identifier,
            messageId: 'collectedStream',
            data: { name: identifier.name },
          });
        }
      },
    };
  },
};
