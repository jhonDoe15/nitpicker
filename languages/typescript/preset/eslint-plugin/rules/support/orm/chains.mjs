import { stringValue } from '../../analysis/constant-resolution.mjs';
import { unwrapped } from '../../secrets/secret-nodes.mjs';

const CALL = 'CallExpression';
const MEMBER = 'MemberExpression';

function memberName(member) {
  return member.computed ? stringValue(member.property) : member.property.name;
}

function rootName(node) {
  if (node.type === 'Identifier') {
    return node.name;
  }
  return node.type === 'ThisExpression' ? 'this' : undefined;
}

function callStep(current) {
  const callee = unwrapped(current.callee);
  if (callee.type === MEMBER) {
    const step = { name: memberName(callee), args: current.arguments, node: current };
    return { step, next: unwrapped(callee.object) };
  }
  const name = callee.type === 'Identifier' ? callee.name : undefined;
  return { step: { name, args: current.arguments, node: current, isRootCall: true }, root: name };
}

function stepOf(current) {
  if (current.type === CALL) {
    return callStep(current);
  }
  if (current.type === MEMBER) {
    const step = { name: memberName(current), args: undefined, node: current };
    return { step, next: unwrapped(current.object) };
  }
  return { root: rootName(current) };
}

export function callChain(call) {
  const steps = [];
  const start = unwrapped(call);
  const pending = start === undefined ? [] : [start];
  let root;
  for (const current of pending) {
    const found = stepOf(current);
    if (found.step !== undefined) {
      steps.push(found.step);
    }
    root = found.root;
    if (found.next !== undefined) {
      pending.push(found.next);
    }
  }
  return { root, steps: steps.toReversed() };
}

export function rootNode(call) {
  const pending = [unwrapped(call)];
  for (const current of pending) {
    if (current?.type !== CALL && current?.type !== MEMBER) {
      return current;
    }
    pending.push(unwrapped(current.type === CALL ? current.callee : current.object));
  }
  return undefined;
}

export function firstString(args) {
  return args === undefined || args.length === 0 ? undefined : stringValue(args[0]);
}
