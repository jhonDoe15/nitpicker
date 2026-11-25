import { isOneOf, nodesOf, placed, present } from '../../../../near-duplicates/tree/nodes.mts';
import { fact } from '../../facts.mts';
import { binaryOf, exitOf, sourceOf, statementsOf, valueEqualOf } from '../exits.mts';
import { appendAll } from '../../../../lists/lists.mts';
import type {
  Check,
  Fact,
  Flow,
  FlowChild,
  FlowNode,
  FlowScope,
} from '../../typed/decided-types.mts';

type ArmShape = {
  readonly labels: readonly FlowNode[];
  readonly body: FlowNode | undefined;
  readonly classic: boolean;
  readonly wrapped: boolean;
  readonly isDefault: boolean;
};

type Group = { readonly arms: ArmShape[]; last: ArmShape; readonly fallsIn: boolean };

type ArmContext = {
  readonly node: FlowNode;
  readonly subject: FlowNode;
  readonly flow: Flow;
  readonly earlier: readonly FlowNode[];
};

type ArmFlow = { readonly children: FlowChild[]; readonly checks: Check[] };

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

export function isSwitchLike(node: FlowNode): boolean {
  return (
    (node.kind === 'statement' || node.kind === 'expression') &&
    isOneOf(SWITCHES, node.value) &&
    node.children[0] !== undefined &&
    node.children.slice(1).every((arm) => arm.kind === 'statement' && isOneOf(ARMS, arm.value))
  );
}

export function isArm(node: FlowNode): boolean {
  return node.kind === 'statement' && isOneOf(ARMS, node.value);
}

function armOf(arm: FlowNode): ArmShape {
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

function factOf(
  condition: FlowNode,
  flow: Flow,
  { holds, reason }: { readonly holds: boolean; readonly reason: string },
): Fact[] {
  const known = fact(condition, flow.scope, { holds, reason });
  return known === undefined ? [] : [known];
}

export function isSimpleSubject(subject: FlowNode): boolean {
  const pending: FlowNode[] = [subject];
  for (const node of pending) {
    if (!SUBJECTS.has(node.kind)) {
      return false;
    }
    appendAll(pending, node.children);
  }
  return true;
}

export function isPlainLiteral(node: FlowNode): boolean {
  if (node.kind === 'unary') {
    const operand = present(node.children[0]);
    return node.value === '-' && operand.kind === 'literal' && operand.literal === 'number';
  }
  return node.kind === 'literal' && isOneOf(PLAIN_LITERALS, node.literal);
}

function constantOf(label: FlowNode, type: string): string | undefined {
  if (label.kind === 'name' && label.binding === 'free') {
    return `${type}.${String(label.text)}`;
  }
  const owner = label.children[0];
  const isQualified = label.kind === 'member' && owner?.kind === 'name' && owner.text === type;
  return isQualified ? `${type}.${String(label.value)}` : undefined;
}

function switchConstants(node: FlowNode, types: ReadonlyMap<string, string>): string[] {
  const [rawSubject, ...arms] = node.children;
  const subject = present(rawSubject);
  const type =
    subject.kind === 'name' && subject.value !== undefined ? types.get(subject.value) : undefined;
  const labels = arms
    .map(armOf)
    .filter(({ wrapped }) => wrapped)
    .flatMap(({ labels: own }) => own);
  const enumType = type === undefined || VALUE_TYPES.has(type) ? undefined : type;
  return (enumType === undefined ? [] : labels)
    .map((label) => constantOf(label, String(enumType)))
    .filter((constant) => constant !== undefined);
}

export function enumConstants(tree: FlowNode, types: ReadonlyMap<string, string>): Set<string> {
  return new Set(
    nodesOf(tree)
      .filter(isSwitchLike)
      .flatMap((node) => switchConstants(node, types)),
  );
}

function enumNode(constant: string, label: FlowNode): FlowNode {
  return {
    ...placed(label.start, undefined),
    kind: 'literal',
    literal: 'enum',
    value: constant,
    text: label.text ?? constant,
    children: [],
  };
}

function comparable(label: FlowNode, subject: FlowNode, scope: FlowScope): FlowNode | undefined {
  if (isPlainLiteral(label)) {
    return label;
  }
  const type =
    subject.kind === 'name' && subject.value !== undefined
      ? scope.types.get(subject.value)
      : undefined;
  const constant = type === undefined ? undefined : constantOf(label, type);
  return constant !== undefined && scope.enums.has(constant)
    ? enumNode(constant, label)
    : undefined;
}

function labelsOf(arm: ArmShape, subject: FlowNode, scope: FlowScope): FlowNode[] {
  const labels = arm.labels.map((label) => comparable(label, subject, scope));
  return labels.every((label): label is FlowNode => label !== undefined) ? labels : [];
}

function groupsOf(arms: readonly ArmShape[]): Group[] {
  const groups: Group[] = [];
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

function excluding(labels: readonly FlowNode[], context: ArmContext): Fact[] {
  const { node, subject, flow } = context;
  return labels.flatMap((label) => {
    const reason = `it is not \`case ${sourceOf(label)}\` of the \`${String(node.value)}\` on line ${String(node.start)}`;
    return factOf(valueEqualOf(subject, label), flow, { holds: false, reason });
  });
}

function takingFacts(group: Group, context: ArmContext): Fact[] {
  const { node, subject, flow, earlier } = context;
  if (group.fallsIn) {
    return [];
  }
  if (group.arms.some(({ isDefault }) => isDefault)) {
    return group.arms.length === 1 ? excluding(earlier, context) : [];
  }
  const labels = group.arms.map((arm) => labelsOf(arm, subject, flow.scope));
  if (labels.some((own, index) => own.length !== group.arms[index]?.labels.length)) {
    return [];
  }
  const taken = labels.flat();
  const condition = taken
    .map((label) => valueEqualOf(subject, label))
    .reduce((left, right) => binaryOf('||', left, right));
  const reason = `it is in the \`case ${taken.map(sourceOf).join(', ')}\` arm of the \`${String(node.value)}\` on line ${String(node.start)}`;
  return factOf(condition, flow, { holds: true, reason });
}

function subjectArms(node: FlowNode, facts: readonly Fact[], flow: Flow): ArmFlow {
  const [rawSubject, ...arms] = node.children;
  const subject = present(rawSubject);
  const children: FlowChild[] = [];
  const checks: Check[] = [];
  const earlier: FlowNode[] = [];
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
    appendAll(
      checks,
      own.map((label) => ({ condition: valueEqualOf(subject, label), facts: before })),
    );
    appendAll(earlier, own);
  }
  return { children, checks };
}

function conditionArms(node: FlowNode, facts: readonly Fact[], flow: Flow): ArmFlow {
  const line = String(node.start);
  const children: FlowChild[] = [];
  const earlier: FlowNode[] = [];
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
    appendAll(earlier, isDefault ? [] : labels);
  }
  return { children, checks: [] };
}

export function armFlow(node: FlowNode, facts: readonly Fact[], flow: Flow): ArmFlow {
  const subject = present(node.children[0]);
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
