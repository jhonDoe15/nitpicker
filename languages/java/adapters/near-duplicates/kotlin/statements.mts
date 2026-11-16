import type { Node } from 'web-tree-sitter';
import type { KotlinContext, KotlinConverter, PlacedNode, ShapeNode } from '../jvm-types.mts';
import {
  NONE,
  at,
  blockOrStatements,
  codeChildren,
  field,
  grouped,
  present,
  typeNode,
} from '../tree/nodes.mts';

const BLOCK_KIND = 'block';
const CONDITION_FIELD = 'condition';
const EVALUATE_KIND = 'evaluate';

const STATEMENT_KINDS = new Set([
  'declare',
  EVALUATE_KIND,
  'if',
  'return',
  'throw',
  'break',
  'continue',
]);
const LOOP_KINDS = new Set(['for', 'foreach', 'while', 'do', BLOCK_KIND, 'statement']);

function isList(value: ShapeNode | readonly ShapeNode[]): value is readonly ShapeNode[] {
  return Array.isArray(value);
}

function typeChild(source: Node): ShapeNode {
  return typeNode(codeChildren(source).find((child) => child.type.endsWith('_type')));
}

function asStatement(node: ShapeNode, source: Node): ShapeNode {
  if (STATEMENT_KINDS.has(node.kind) || LOOP_KINDS.has(node.kind)) {
    return node;
  }
  return at(EVALUATE_KIND, source, [node]);
}

function statementOf(source: Node, context: KotlinContext): readonly ShapeNode[] {
  const converted = context.raw(source);
  return isList(converted) ? converted : [asStatement(converted, source)];
}

export function bodyOf(source: Node | undefined, context: KotlinContext): ShapeNode {
  return blockOrStatements(source, context, statementOf);
}

function blockOf(source: Node, context: KotlinContext): PlacedNode {
  return at(
    BLOCK_KIND,
    source,
    codeChildren(source).flatMap((child) => statementOf(child, context)),
  );
}

function declaredOf(
  declaration: Node,
  context: KotlinContext,
): { type: ShapeNode; name: ShapeNode } {
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

export function assignedValue(source: Node): Node | undefined {
  const equals = source.children.findIndex((child) => child.type === '=');
  return equals === -1
    ? undefined
    : source.children.slice(equals + 1).find((child) => child.isNamed);
}

function propertyOf(source: Node, context: KotlinContext): PlacedNode {
  const declaration = present(
    codeChildren(source).find(
      (child) =>
        child.type === 'variable_declaration' || child.type === 'multi_variable_declaration',
    ),
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

function branches(source: Node): Node[] {
  const condition = field(source, CONDITION_FIELD);
  return codeChildren(source).filter((child) => child.id !== condition?.id);
}

function branchValue(branch: Node | undefined, context: KotlinContext): ShapeNode {
  return branch === undefined ? NONE : context.get(branch);
}

function ifOf(source: Node, context: KotlinContext): PlacedNode {
  const [consequence, alternative] = branches(source);
  const condition = context.get(field(source, CONDITION_FIELD));
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

function loopParts(source: Node): Node[] {
  return codeChildren(source).filter((child) => child.type !== 'label');
}

function forOf(source: Node, context: KotlinContext): PlacedNode {
  const [declaration, iterable, body] = loopParts(source);
  const { type, name } = declaredOf(present(declaration), context);
  return at('foreach', source, [type, name, context.get(iterable), bodyOf(body, context)]);
}

function conditionAndBody(source: Node, context: KotlinContext): ShapeNode[] {
  const condition = field(source, CONDITION_FIELD);
  const body = loopParts(source).find((child) => child.id !== condition?.id);
  return [context.get(condition), bodyOf(body, context)];
}

function whileOf(source: Node, context: KotlinContext): PlacedNode {
  return at('while', source, conditionAndBody(source, context));
}

function doOf(source: Node, context: KotlinContext): PlacedNode {
  return at('do', source, conditionAndBody(source, context).toReversed());
}

function catchOf(clause: Node, context: KotlinContext): PlacedNode {
  const [name, type, body] = codeChildren(clause);
  return grouped('catch', clause, [typeNode(type), context.get(name), bodyOf(body, context)]);
}

function tryOf(source: Node, context: KotlinContext): PlacedNode {
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

function whenEntryOf(entry: Node, context: KotlinContext): PlacedNode {
  const conditions = entry.childrenForFieldName(CONDITION_FIELD).filter(Boolean);
  const ids = new Set(conditions.map(({ id }) => id));
  const body = codeChildren(entry).find((child) => !ids.has(child.id));
  const tests = conditions.map((condition) => context.get(condition));
  return grouped(conditions.length === 0 ? 'else' : 'case', entry, [
    ...tests,
    bodyOf(body, context),
  ]);
}

function whenOf(source: Node, context: KotlinContext): PlacedNode {
  const [first, ...rest] = codeChildren(source);
  const subject =
    first?.type === 'when_subject' ? context.get(codeChildren(first).at(-1)) : undefined;
  const entries = (first?.type === 'when_subject' ? rest : [first, ...rest]).filter(
    (entry) => entry !== undefined,
  );
  return at(
    { kind: context.isStatement(source) ? 'statement' : 'expression', value: 'when' },
    source,
    [subject ?? NONE, ...entries.map((entry) => whenEntryOf(entry, context))],
  );
}

function jumpOf(kind: string): KotlinConverter {
  return (source, context) => {
    const label = field(source, 'label');
    const value = codeChildren(source).find((child) => child.id !== label?.id);
    return at(kind, source, [value === undefined ? NONE : context.get(value)]);
  };
}

function labeledOf(source: Node, context: KotlinContext): PlacedNode {
  const [first, target] = codeChildren(source);
  const label = present(first);
  const kind = label.text.replace('@', '');
  if (kind === 'break' || kind === 'continue') {
    return at({ kind, value: present(target).text }, source);
  }
  return at({ kind: 'expression', value: `label:${label.text}` }, source, [context.get(target)]);
}

export const STATEMENTS: Readonly<Record<string, KotlinConverter>> = {
  block: blockOf,
  statements: blockOf,
  property_declaration: propertyOf,
  assignment: (source, context) =>
    at(EVALUATE_KIND, source, [
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
