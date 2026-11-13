import { NONE, at, codeChildren, field, grouped, typeNode } from '../tree/nodes.mjs';

const STATEMENT_KINDS = new Set([
  'declare',
  'evaluate',
  'if',
  'return',
  'throw',
  'break',
  'continue',
]);
const LOOP_KINDS = new Set(['for', 'foreach', 'while', 'do', 'block', 'statement']);

function typeChild(source) {
  return typeNode(codeChildren(source).find((child) => child.type.endsWith('_type')));
}

function asStatement(node, source) {
  if (STATEMENT_KINDS.has(node.kind) || LOOP_KINDS.has(node.kind)) {
    return node;
  }
  return at('evaluate', source, [node]);
}

function statementOf(source, context) {
  const converted = context.get(source);
  return Array.isArray(converted) ? converted : [asStatement(converted, source)];
}

export function bodyOf(source, context) {
  if (source === undefined) {
    return NONE;
  }
  if (source.type === 'block') {
    return context.get(source);
  }
  return at('block', source, statementOf(source, context));
}

function blockOf(source, context) {
  return at(
    'block',
    source,
    codeChildren(source).flatMap((child) => statementOf(child, context)),
  );
}

function declaredOf(declaration, context) {
  if (declaration.type === 'multi_variable_declaration') {
    return {
      type: NONE,
      name: at(
        { kind: 'expression', value: 'destructure' },
        declaration,
        codeChildren(declaration).map((part) => context.get(codeChildren(part)[0])),
      ),
    };
  }
  return {
    type: typeChild(declaration),
    name: context.get(codeChildren(declaration)[0]),
  };
}

export function assignedValue(source) {
  const equals = source.children.findIndex((child) => child.type === '=');
  return equals === -1
    ? undefined
    : source.children.slice(equals + 1).find((child) => child.isNamed);
}

function propertyOf(source, context) {
  const declaration = codeChildren(source).find(
    (child) => child.type === 'variable_declaration' || child.type === 'multi_variable_declaration',
  );
  const value = assignedValue(source);
  const { type, name } = declaredOf(declaration, context);
  return at(
    {
      kind: 'declare',
      value: source.children.some((child) => child.type === 'var') ? 'var' : 'val',
    },
    source,
    [type, name, value === undefined ? NONE : context.get(value)],
  );
}

function branches(source) {
  const condition = field(source, 'condition');
  return codeChildren(source).filter((child) => child.id !== condition?.id);
}

function branchValue(branch, context) {
  return branch === undefined ? NONE : context.get(branch);
}

function ifOf(source, context) {
  const [consequence, alternative] = branches(source);
  const condition = context.get(field(source, 'condition'));
  if (context.isStatement(source)) {
    return at('if', source, [
      condition,
      bodyOf(consequence, context),
      bodyOf(alternative, context),
    ]);
  }
  return at('conditional', source, [
    condition,
    branchValue(consequence, context),
    branchValue(alternative, context),
  ]);
}

function loopParts(source) {
  return codeChildren(source).filter((child) => child.type !== 'label');
}

function forOf(source, context) {
  const [declaration, iterable, body] = loopParts(source);
  const { type, name } = declaredOf(declaration, context);
  return at('foreach', source, [type, name, context.get(iterable), bodyOf(body, context)]);
}

function conditionAndBody(source, context) {
  const condition = field(source, 'condition');
  const body = loopParts(source).find((child) => child.id !== condition.id);
  return [context.get(condition), bodyOf(body, context)];
}

function whileOf(source, context) {
  return at('while', source, conditionAndBody(source, context));
}

function doOf(source, context) {
  return at('do', source, conditionAndBody(source, context).toReversed());
}

function catchOf(clause, context) {
  const [name, type, body] = codeChildren(clause);
  return grouped('catch', clause, [typeNode(type), context.get(name), bodyOf(body, context)]);
}

function tryOf(source, context) {
  const [body, ...clauses] = codeChildren(source);
  return grouped('try', source, [
    bodyOf(body, context),
    ...clauses.map((clause) =>
      clause.type === 'catch_block'
        ? catchOf(clause, context)
        : grouped('finally', clause, [bodyOf(codeChildren(clause)[0], context)]),
    ),
  ]);
}

function whenEntryOf(entry, context) {
  const conditions = entry.childrenForFieldName('condition').filter(Boolean);
  const ids = new Set(conditions.map(({ id }) => id));
  const body = codeChildren(entry).find((child) => !ids.has(child.id));
  const tests = conditions.map((condition) => context.get(condition));
  return grouped(conditions.length === 0 ? 'else' : 'case', entry, [
    ...tests,
    bodyOf(body, context),
  ]);
}

function whenOf(source, context) {
  const [first, ...rest] = codeChildren(source);
  const subject =
    first?.type === 'when_subject' ? context.get(codeChildren(first).at(-1)) : undefined;
  const entries = (first?.type === 'when_subject' ? rest : [first, ...rest]).filter(Boolean);
  return at(
    { kind: context.isStatement(source) ? 'statement' : 'expression', value: 'when' },
    source,
    [subject ?? NONE, ...entries.map((entry) => whenEntryOf(entry, context))],
  );
}

function jumpOf(kind) {
  return (source, context) => {
    const label = field(source, 'label');
    const value = codeChildren(source).find((child) => child.id !== label?.id);
    return at(kind, source, [value === undefined ? NONE : context.get(value)]);
  };
}

function labeledOf(source, context) {
  const [label, target] = codeChildren(source);
  const kind = label.text.replace('@', '');
  if (kind === 'break' || kind === 'continue') {
    return at({ kind, value: target.text }, source);
  }
  return at({ kind: 'expression', value: `label:${label.text}` }, source, [context.get(target)]);
}

export const STATEMENTS = {
  block: blockOf,
  statements: blockOf,
  property_declaration: propertyOf,
  assignment: (source, context) =>
    at('evaluate', source, [
      at({ kind: 'assign', value: field(source, 'operator')?.type ?? '=' }, source, [
        context.get(field(source, 'left')),
        context.get(field(source, 'right')),
      ]),
    ]),
  if_expression: ifOf,
  for_statement: forOf,
  while_statement: whileOf,
  do_while_statement: doOf,
  try_expression: tryOf,
  when_expression: whenOf,
  return_expression: jumpOf('return'),
  throw_expression: jumpOf('throw'),
  labeled_expression: labeledOf,
};
