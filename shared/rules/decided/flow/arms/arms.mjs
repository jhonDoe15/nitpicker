import { nodesOf } from '../../../../near-duplicates/tree/nodes.mjs';
import { fact } from '../../facts.mjs';
import { binaryOf, exitOf, sourceOf, statementsOf, valueEqualOf } from '../exits.mjs';

const SWITCHES = new Set(['switch', 'when', 'match']);
const ARMS = new Set(['case', 'rule', 'else']);
const PLAIN_LITERALS = new Set(['number', 'string', 'char', 'boolean', 'null', 'enum']);
const SUBJECTS = new Set(['name', 'this', 'member']);
const VALUE_TYPES = new Set([
  'int',
  'long',
  'short',
  'byte',
  'char',
  'String',
  'Integer',
  'Long',
  'Short',
  'Byte',
  'Character',
  'Object',
]);

export function isSwitchLike(node) {
  return (
    (node.kind === 'statement' || node.kind === 'expression') &&
    SWITCHES.has(node.value) &&
    node.children[0] !== undefined &&
    node.children.slice(1).every((arm) => arm.kind === 'statement' && ARMS.has(arm.value))
  );
}

export function isArm(node) {
  return node.kind === 'statement' && ARMS.has(node.value);
}

function armOf(arm) {
  const [first] = arm.children;
  const wrapped = first?.kind === 'statement' && first.value === 'label';
  const labels = wrapped ? first.children : arm.children.slice(0, -1);
  return {
    labels,
    body: arm.children.at(-1),
    classic: wrapped && arm.value === 'case',
    wrapped,
    isDefault: arm.value === 'else' || (wrapped && labels.length === 0),
  };
}

function factOf(condition, flow, { holds, reason }) {
  const known = fact(condition, flow.scope, { holds, reason });
  return known === undefined ? [] : [known];
}

export function isSimpleSubject(subject) {
  const pending = [subject];
  for (const node of pending) {
    if (!SUBJECTS.has(node.kind)) {
      return false;
    }
    pending.push(...node.children);
  }
  return true;
}

export function isPlainLiteral(node) {
  if (node.kind === 'unary') {
    const [operand] = node.children;
    return node.value === '-' && operand.kind === 'literal' && operand.literal === 'number';
  }
  return node.kind === 'literal' && PLAIN_LITERALS.has(node.literal);
}

function constantOf(label, type) {
  if (label.kind === 'name' && label.binding === 'free') {
    return `${type}.${label.text}`;
  }
  const owner = label.children[0];
  const isQualified = label.kind === 'member' && owner?.kind === 'name' && owner.text === type;
  return isQualified ? `${type}.${label.value}` : undefined;
}

export function enumConstants(tree, types) {
  const constants = new Set();
  for (const node of nodesOf(tree).filter(isSwitchLike)) {
    const [subject, ...arms] = node.children;
    const type = subject.kind === 'name' ? types.get(subject.value) : undefined;
    const labels = arms
      .map(armOf)
      .filter(({ wrapped }) => wrapped)
      .flatMap(({ labels: own }) => own);
    for (const label of type === undefined || VALUE_TYPES.has(type) ? [] : labels) {
      constants.add(constantOf(label, type));
    }
  }
  constants.delete(undefined);
  return constants;
}

function enumNode(constant, label) {
  return {
    kind: 'literal',
    literal: 'enum',
    value: constant,
    text: label.text ?? constant,
    children: [],
    start: label.start,
  };
}

function comparable(label, subject, scope) {
  if (isPlainLiteral(label)) {
    return label;
  }
  const type = subject.kind === 'name' ? scope.types.get(subject.value) : undefined;
  const constant = type === undefined ? undefined : constantOf(label, type);
  return scope.enums.has(constant) ? enumNode(constant, label) : undefined;
}

function labelsOf(arm, subject, scope) {
  const labels = arm.labels.map((label) => comparable(label, subject, scope));
  return labels.every((label) => label !== undefined) ? labels : [];
}

function groupsOf(arms) {
  const groups = [];
  for (const arm of arms) {
    const previous = groups.at(-1);
    const fallsIn =
      previous !== undefined && arm.classic && exitOf(previous.last.body) === undefined;
    if (fallsIn && statementsOf(previous.last.body).length === 0) {
      previous.arms.push(arm);
      previous.last = arm;
    } else {
      groups.push({ arms: [arm], last: arm, fallsIn });
    }
  }
  return groups;
}

function excluding(labels, context) {
  const { node, subject, flow } = context;
  return labels.flatMap((label) => {
    const reason = `it is not \`case ${sourceOf(label)}\` of the \`${node.value}\` on line ${String(node.start)}`;
    return factOf(valueEqualOf(subject, label), flow, { holds: false, reason });
  });
}

function takingFacts(group, context) {
  const { node, subject, flow, earlier } = context;
  if (group.fallsIn) {
    return [];
  }
  if (group.arms.some(({ isDefault }) => isDefault)) {
    return group.arms.length === 1 ? excluding(earlier, context) : [];
  }
  const labels = group.arms.map((arm) => labelsOf(arm, subject, flow.scope));
  if (labels.some((own, index) => own.length !== group.arms[index].labels.length)) {
    return [];
  }
  const taken = labels.flat();
  const condition = taken
    .map((label) => valueEqualOf(subject, label))
    .reduce((left, right) => binaryOf('||', left, right));
  const reason = `it is in the \`case ${taken.map(sourceOf).join(', ')}\` arm of the \`${node.value}\` on line ${String(node.start)}`;
  return factOf(condition, flow, { holds: true, reason });
}

function subjectArms(node, facts, flow) {
  const [subject, ...arms] = node.children;
  const children = [];
  const checks = [];
  const earlier = [];
  for (const group of groupsOf(arms.map(armOf))) {
    const context = { node, subject, flow, earlier };
    const own = group.arms.flatMap((arm) =>
      arm.isDefault ? [] : labelsOf(arm, subject, flow.scope),
    );
    const body = statementsOf(group.last.body);
    if (body.length > 0) {
      children.push({ statements: body, facts: [...facts, ...takingFacts(group, context)] });
    }
    const before = [...facts, ...excluding(earlier, context)];
    checks.push(
      ...own.map((label) => ({ condition: valueEqualOf(subject, label), facts: before })),
    );
    earlier.push(...own);
  }
  return { children, checks };
}

function conditionArms(node, facts, flow) {
  const line = String(node.start);
  const children = [];
  const earlier = [];
  for (const { labels, body, isDefault } of node.children.slice(1).map(armOf)) {
    const before = earlier.flatMap((label) => {
      const reason = `an earlier arm takes \`${sourceOf(label)}\` (line ${String(label.start)})`;
      return factOf(label, flow, { holds: false, reason });
    });
    const own = isDefault
      ? []
      : labels.flatMap((label) => {
          const reason = `it is in the \`${sourceOf(label)}\` arm of the \`when\` on line ${line}`;
          return factOf(label, flow, { holds: true, reason });
        });
    children.push({ statements: statementsOf(body), facts: [...facts, ...before, ...own] });
    earlier.push(...(isDefault ? [] : labels));
  }
  return { children, checks: [] };
}

export function armFlow(node, facts, flow) {
  const [subject] = node.children;
  if (subject.kind === 'none') {
    return conditionArms(node, facts, flow);
  }
  if (isSimpleSubject(subject)) {
    return subjectArms(node, facts, flow);
  }
  const children = node.children
    .slice(1)
    .map((arm) => ({ statements: statementsOf(arm.children.at(-1)), facts }));
  return { children, checks: [] };
}
