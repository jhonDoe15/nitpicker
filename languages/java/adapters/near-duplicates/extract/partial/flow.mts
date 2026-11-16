import type { Node } from 'web-tree-sitter';
import type { Analysis } from './partial-types.mts';
import { boundNames } from '../../tree/names.mts';
import {
  codeParts,
  descendants,
  field,
  isWritten,
  namedChildren,
  parentOf,
  present,
  required,
  roleOf,
  squashed,
} from '../syntax.mts';

type DeclaredRun = { statement: Node; declarator: Node; where: string };

export const THROW = 'throw_statement';

const ALLOWED = new Set([
  'local_variable_declaration',
  'expression_statement',
  'if_statement',
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
  'try_statement',
  'try_with_resources_statement',
  THROW,
  'return_statement',
  'block',
  'switch_expression',
  'assert_statement',
]);

const LOOPS = new Set([
  'for_statement',
  'enhanced_for_statement',
  'while_statement',
  'do_statement',
]);
const OWN_SCOPES = new Set(['lambda_expression', 'class_body']);
const LOCAL_TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);
const BOTH = 'the run returns a value and also defines one that the code after it uses';
const EARLY = 'the run returns early on some paths';

export function ownNodes(statements: readonly Node[]): Node[] {
  const found: Node[] = [];
  const pending = [...statements];
  for (const node of pending) {
    found.push(node);
    if (!OWN_SCOPES.has(node.type)) {
      pending.push(...node.namedChildren);
    }
  }
  return found;
}

function enclosingWithin(node: Node, statements: readonly Node[]): Node[] {
  const ids = new Set(statements.map(({ id }) => id));
  const found: Node[] = [];
  const pending: Node[] = ids.has(node.id) ? [] : [parentOf(node)];
  for (const current of pending) {
    found.push(current);
    if (!ids.has(current.id)) {
      pending.push(parentOf(current));
    }
  }
  return found;
}

function hasTarget(node: Node, statements: readonly Node[]): boolean {
  const wanted = node.type === 'break_statement' ? [...LOOPS, 'switch_expression'] : [...LOOPS];
  return enclosingWithin(node, statements).some(({ type }) => wanted.includes(type));
}

function jumpProblem(node: Node, statements: readonly Node[]): string | undefined {
  if (node.type === 'return_statement') {
    const final = node.id === present(statements.at(-1)).id && namedChildren(node).length > 0;
    return final ? undefined : EARLY;
  }
  if (node.type === 'break_statement' || node.type === 'continue_statement') {
    const inside = namedChildren(node).length === 0 && hasTarget(node, statements);
    return inside ? undefined : 'the run jumps out of itself';
  }
  return node.type === 'yield_statement' || node.type === 'labeled_statement'
    ? 'the run yields or has a label'
    : undefined;
}

function endsAbruptly(statement: Node): boolean {
  const own = descendants(statement);
  switch (statement.type) {
    case THROW:
      return true;
    case 'if_statement':
      return field(statement, 'alternative') !== undefined;
    case 'while_statement':
      return /^\(\s*true\s*\)$/u.test(required(statement, 'condition').text);
    case 'for_statement':
      return field(statement, 'condition') === undefined;
    case 'block':
    case 'try_statement':
    case 'try_with_resources_statement':
    case 'switch_expression':
      return own.some(({ type }) => type === THROW);
    default:
      return false;
  }
}

function shapeProblem(statements: readonly Node[]): string | undefined {
  if (endsAbruptly(present(statements.at(-1)))) {
    return 'the run may end by throwing, so the method could lack a return after the call';
  }
  if (!statements.every(({ type }) => ALLOWED.has(type))) {
    return 'the run has a statement of a kind the shared method cannot take';
  }
  const nodes = ownNodes(statements);
  if (nodes.some(({ type }) => LOCAL_TYPES.has(type))) {
    return 'the run declares a local class';
  }
  return nodes.map((node) => jumpProblem(node, statements)).find(Boolean);
}

export function runLocals(statements: readonly Node[]): Set<string> {
  return new Set(statements.flatMap((statement) => [...boundNames(statement)]));
}

function writeProblem(method: Node, statements: readonly Node[]): string | undefined {
  const own = runLocals(statements);
  const locals = boundNames(method);
  const written = statements
    .flatMap((statement) => descendants(statement))
    .some(
      (node) =>
        node.type === 'identifier' &&
        isWritten(node) &&
        locals.has(node.text) &&
        !own.has(node.text),
    );
  return written ? 'the run writes a variable declared before it' : undefined;
}

function declaredByRun(statements: readonly Node[]): DeclaredRun[] {
  return statements.flatMap((statement, index) =>
    statement.type === 'local_variable_declaration'
      ? codeParts(statement)
          .filter((child) => child.type === 'variable_declarator')
          .map((declarator, position) => ({
            statement,
            declarator,
            where: `${String(index)}:${String(position)}`,
          }))
      : [],
  );
}

function usedAfter(method: Node, statements: readonly Node[]): DeclaredRun[] {
  const end = present(statements.at(-1)).endIndex;
  const later = new Set(
    descendants(required(method, 'body'))
      .filter(
        (node) =>
          node.type === 'identifier' && node.startIndex >= end && roleOf(node) === 'reference',
      )
      .map(({ text }) => text),
  );
  return declaredByRun(statements).filter(({ declarator }) =>
    later.has(required(declarator, 'name').text),
  );
}

function valueOutput(used: readonly DeclaredRun[]): Analysis {
  const { statement, declarator, where } = present(used[0]);
  const type = field(statement, 'type');
  const modifiers = codeParts(statement).find((child) => child.type === 'modifiers');
  const plain = modifiers === undefined || modifiers.text.trim() === 'final';
  if (
    type === undefined ||
    type.text === 'var' ||
    !plain ||
    field(declarator, 'dimensions') !== undefined
  ) {
    return {
      problem:
        'the value that the code after the run uses has a type the shared method cannot name',
    };
  }
  const prefix = modifiers === undefined ? '' : 'final ';
  return {
    output: {
      kind: 'value',
      where,
      name: required(declarator, 'name').text,
      type: squashed(type),
      prefix,
    },
  };
}

function outputOf(method: Node, statements: readonly Node[]): Analysis {
  const endsWithReturn = present(statements.at(-1)).type === 'return_statement';
  const used = usedAfter(method, statements);
  if (used.length > 1) {
    return { problem: 'the run defines more than one value that the code after it uses' };
  }
  if (used.length === 1) {
    return endsWithReturn ? { problem: BOTH } : valueOutput(used);
  }
  return { output: { kind: endsWithReturn ? 'return' : 'none' } };
}

export function runAnalysis(method: Node, statements: readonly Node[]): Analysis {
  const problem = shapeProblem(statements) ?? writeProblem(method, statements);
  return problem === undefined ? outputOf(method, statements) : { problem };
}
