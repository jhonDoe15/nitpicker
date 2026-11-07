import { ancestorsOf } from '../analysis/ancestry.mjs';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  stringValue,
} from '../analysis/constant-resolution.mjs';

const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ChainExpression',
]);
const LOOPS = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);
const CONDITION_LOOPS = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement']);
const LOOP_TEST_WRAPPERS = new Set([
  'AssignmentExpression',
  'BinaryExpression',
  'UnaryExpression',
  'LogicalExpression',
]);
const BRANCH_KEYS = {
  IfStatement: ['consequent', 'alternate'],
  ConditionalExpression: ['consequent', 'alternate'],
  SwitchStatement: ['cases'],
};

export function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (TYPE_WRAPPERS.has(current?.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isRegExpCall(node) {
  return (
    (node?.type === 'NewExpression' || node?.type === 'CallExpression') &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'RegExp'
  );
}

function creationFlags(context, node) {
  const target = unwrapped(node);
  if (target?.type === 'Literal' && target.regex !== undefined) {
    return target.regex.flags;
  }
  if (!isRegExpCall(target) || target.arguments.length === 0) {
    return undefined;
  }
  const [pattern, flags] = target.arguments;
  if (flags !== undefined) {
    return stringValue(resolveConstant(context, flags));
  }
  return pattern.type === 'Literal' && pattern.regex !== undefined ? pattern.regex.flags : '';
}

function statefulFlag(flags) {
  return ['g', 'y'].find((flag) => flags?.includes(flag));
}

export function enclosingScope(node) {
  return ancestorsOf(node).find(
    (ancestor) =>
      isFunctionNode(ancestor) ||
      ancestor.type === 'PropertyDefinition' ||
      ancestor.type === 'StaticBlock' ||
      ancestor.type === 'Program',
  );
}

function propertyName(member) {
  if (member.computed) {
    return stringValue(member.property);
  }
  return member.property.name;
}

function keyName(key) {
  return key.type === 'Identifier' || key.type === 'PrivateIdentifier' ? key.name : undefined;
}

function enclosingClass(node) {
  return ancestorsOf(node).find(
    (ancestor) => ancestor.type === 'ClassBody' && ancestor.parent !== undefined,
  )?.parent;
}

function constructorAssignment(classNode, name) {
  const constructor = classNode.body.body.find(
    (member) => member.type === 'MethodDefinition' && member.kind === 'constructor',
  );
  const statements = constructor?.value.body?.body ?? [];
  const assignment = statements
    .map((statement) => statement.expression)
    .find(
      (expression) =>
        expression?.type === 'AssignmentExpression' &&
        expression.left.type === 'MemberExpression' &&
        expression.left.object.type === 'ThisExpression' &&
        propertyName(expression.left) === name,
    );
  return assignment?.right;
}

function classMemberValue(classNode, name, isStatic) {
  const member = classNode.body.body.find(
    (candidate) =>
      candidate.type === 'PropertyDefinition' &&
      !candidate.computed &&
      candidate.static === isStatic &&
      keyName(candidate.key) === name,
  );
  if (member?.value) {
    return member.value;
  }
  return isStatic ? undefined : constructorAssignment(classNode, name);
}

function onlyDefinition(context, identifier) {
  const variable = findVariable(context, identifier, identifier.name);
  return variable?.defs.length === 1 ? { variable, definition: variable.defs[0] } : undefined;
}

function isNeverReassigned(variable) {
  return variable.references.filter((reference) => reference.isWrite()).length <= 1;
}

function variableValue(context, identifier) {
  const found = onlyDefinition(context, identifier);
  const definition = found?.definition;
  if (definition?.type !== 'Variable' || definition.node.id.type !== 'Identifier') {
    return undefined;
  }
  return isNeverReassigned(found.variable) ? (definition.node.init ?? undefined) : undefined;
}

function objectPropertyValue(objectExpression, name) {
  const property = objectExpression.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      candidate.kind === 'init' &&
      (keyName(candidate.key) ?? stringValue(candidate.key)) === name,
  );
  return property?.value;
}

function thisMemberValue(member, name) {
  const classNode = enclosingClass(member);
  const isStatic = enclosingScope(member)?.parent?.static === true;
  return classNode === undefined ? undefined : classMemberValue(classNode, name, isStatic);
}

function memberValue(context, member) {
  const name = propertyName(member);
  const object = unwrapped(member.object);
  if (name === undefined) {
    return undefined;
  }
  if (object.type === 'ThisExpression') {
    return thisMemberValue(member, name);
  }
  if (object.type !== 'Identifier') {
    return undefined;
  }
  const definition = onlyDefinition(context, object)?.definition;
  if (definition?.type === 'ClassName') {
    return classMemberValue(definition.node, name, true);
  }
  const value = unwrapped(variableValue(context, object));
  return value?.type === 'ObjectExpression' ? objectPropertyValue(value, name) : undefined;
}

export function heldRegex(context, node) {
  const target = unwrapped(node);
  let value;
  if (target?.type === 'Identifier') {
    value = variableValue(context, target);
  } else if (target?.type === 'MemberExpression') {
    value = memberValue(context, target);
  }
  const flag = value === undefined ? undefined : statefulFlag(creationFlags(context, value));
  return flag === undefined ? undefined : { creation: unwrapped(value), flag };
}

export function isLoopCondition(call) {
  let child = call;
  for (const parent of ancestorsOf(call)) {
    if (CONDITION_LOOPS.has(parent.type)) {
      return parent.test === child;
    }
    if (!LOOP_TEST_WRAPPERS.has(parent.type) && !TYPE_WRAPPERS.has(parent.type)) {
      return false;
    }
    child = parent;
  }
  return false;
}

export function isInLoopWithout(node, scope, inner) {
  for (const ancestor of ancestorsOf(node)) {
    if (ancestor === scope) {
      return false;
    }
    const contains = ancestor.range[0] <= inner.range[0] && inner.range[1] <= ancestor.range[1];
    if (LOOPS.has(ancestor.type) && !contains) {
      return true;
    }
  }
  return false;
}

function branchOf(owner, node) {
  return (BRANCH_KEYS[owner.type] ?? [])
    .flatMap((key) => owner[key] ?? [])
    .flat()
    .find((branch) => branch.range[0] <= node.range[0] && node.range[1] <= branch.range[1]);
}

export function areExclusive(left, right) {
  const shared = ancestorsOf(left).find(
    (ancestor) => ancestor.range[0] <= right.range[0] && right.range[1] <= ancestor.range[1],
  );
  if (shared === undefined) {
    return false;
  }
  const leftBranch = branchOf(shared, left);
  const rightBranch = branchOf(shared, right);
  return leftBranch !== undefined && rightBranch !== undefined && leftBranch !== rightBranch;
}
