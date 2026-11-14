import {
  decidingFact,
  relevantFacts,
  solveFacts,
} from '../../../../../../../shared/logic/sync/solve-facts.mjs';
import { term } from '../../../../../../../shared/logic/terms.mjs';
import { toTerm } from '../../analysis/logic/estree-terms.mjs';
import { factOfTerm } from '../facts.mjs';

const JUMP_TYPES = new Set([
  'ReturnStatement',
  'ThrowStatement',
  'BreakStatement',
  'ContinueStatement',
]);
const VERDICTS = new Map([
  ['true', 'alwaysTrue'],
  ['false', 'alwaysFalse'],
]);

function isLiteralLabel(node) {
  if (node.type === 'UnaryExpression') {
    const { argument } = node;
    return (
      node.operator === '-' && argument.type === 'Literal' && typeof argument.value === 'number'
    );
  }
  return node.type === 'Literal' && node.regex === undefined;
}

function isSimpleSubject(node) {
  let current = node;
  while (current.type === 'MemberExpression' && !current.computed && !current.optional) {
    current = current.object;
  }
  return current.type === 'Identifier' || current.type === 'ThisExpression';
}

function endsInJump(consequent) {
  let last = consequent.at(-1);
  while (last?.type === 'BlockStatement') {
    last = last.body.at(-1);
  }
  return JUMP_TYPES.has(last?.type);
}

function groupsOf(cases) {
  const groups = [];
  for (const switchCase of cases) {
    const previous = groups.at(-1);
    const fallsIn = previous !== undefined && !endsInJump(previous.last.consequent);
    if (fallsIn && previous.last.consequent.length === 0) {
      previous.cases.push(switchCase);
      previous.last = switchCase;
    } else {
      groups.push({ cases: [switchCase], last: switchCase, fallsIn });
    }
  }
  return groups;
}

function equality(subject, label, sourceCode) {
  return term('binary', '===', [toTerm(subject, sourceCode), toTerm(label, sourceCode)]);
}

function labelsOf(group) {
  const labels = group.cases.map(({ test }) => test);
  return labels.every((test) => test !== null && isLiteralLabel(test)) ? labels : [];
}

function takingFacts(group, context) {
  const { node, sourceCode, earlier } = context;
  const line = String(node.loc.start.line);
  if (group.fallsIn) {
    return [];
  }
  const isDefault = group.cases.some(({ test }) => test === null);
  const query = (label) => equality(node.discriminant, label, sourceCode);
  if (isDefault) {
    return group.cases.length > 1
      ? []
      : earlier.map((label) =>
          factOfTerm(query(label), {
            holds: false,
            reason: `it is not \`case ${sourceCode.getText(label)}\` of the \`switch\` on line ${line}`,
          }),
        );
  }
  const labels = labelsOf(group);
  if (labels.length === 0) {
    return [];
  }
  const joined = labels.map(query).reduce((left, right) => term('logical', '||', [left, right]));
  const text = labels.map((label) => sourceCode.getText(label)).join(', ');
  return [
    factOfTerm(joined, {
      holds: true,
      reason: `it is in the \`case ${text}\` arm of the \`switch\` on line ${line}`,
    }),
  ];
}

/**
 * The statement lists of the cases of a `switch` over a plain variable or member, each with what
 * its entry tells (`subject === label`; for `default`, `subject !== label` of every earlier case; a
 * case a non-empty case falls into gets nothing), and the label checks for dead cases.
 */
export function switchFlow(node, facts, context) {
  if (!isSimpleSubject(node.discriminant)) {
    return undefined;
  }
  const { sourceCode } = context;
  const children = [];
  const checks = [];
  const earlier = [];
  for (const group of groupsOf(node.cases)) {
    const arms = { node, sourceCode, earlier };
    const own = labelsOf(group);
    children.push({
      statements: group.last.consequent,
      facts: [...facts, ...takingFacts(group, arms)],
    });
    const before = earlier.map((label) =>
      factOfTerm(equality(node.discriminant, label, sourceCode), {
        holds: false,
        reason: `it is not \`case ${sourceCode.getText(label)}\` of the \`switch\` on line ${String(node.loc.start.line)}`,
      }),
    );
    checks.push(...own.map((label) => ({ label: { node, label }, facts: [...facts, ...before] })));
    earlier.push(...own);
  }
  return { children, checks };
}

/** Reports a `case` label that the facts before the `switch` decide. */
export function checkLabel(scan, { node, label }, facts) {
  const { sourceCode } = scan;
  const query = equality(node.discriminant, label, sourceCode);
  const known = relevantFacts(facts, factOfTerm(query, { holds: true }).names);
  const verdict =
    known.length === 0
      ? undefined
      : solveFacts(
          known.map((one) => one.term),
          query,
        );
  if (!VERDICTS.has(verdict)) {
    return;
  }
  const reason =
    decidingFact(known, query, verdict)?.reason ?? 'the conditions before it decide it together';
  const condition = `${sourceCode.getText(node.discriminant)} === ${sourceCode.getText(label)}`;
  scan.context.report({
    node: label,
    messageId: VERDICTS.get(verdict),
    data: { condition, reason },
  });
}
