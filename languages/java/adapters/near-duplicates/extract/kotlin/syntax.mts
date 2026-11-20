import type { Node } from 'web-tree-sitter';
import { boundNames } from '../../kotlin/names.mts';
import {
  codeParts,
  descendants,
  field,
  hasAncestorIn,
  parentOf,
  present,
  squashed,
} from '../syntax.mts';

export const FUNCTION = 'function_declaration';
const NUMBER = /^\d[\d_]*$/u;
const LONG = /^\d[\d_]*[lL]$/u;
const REAL = /^\d[\d_]*\.\d[\d_]*$/u;
const SINGLE = /^\d[\d_]*(?:\.\d[\d_]*)?[fF]$/u;
const INT_MAX = 2147483647n;
const LONG_MAX = 9223372036854775807n;
const ALLOWED_MODIFIERS = new Set([
  'private',
  'internal',
  'protected',
  'public',
  'override',
  'open',
  'final',
  'suspend',
  'operator',
  'infix',
]);
const NAMELESS_ROLES = new Set(['user_type', 'qualified_identifier', 'import', 'package_header']);
const LOOPS = new Set(['for_statement', 'while_statement', 'do_while_statement']);
const JUMPS = new Set(['break', 'continue']);

export type Role = 'reference' | 'callee' | 'member' | 'declaration' | 'other';

export function isTypeNode(node: Node): boolean {
  return node.type.endsWith('_type');
}

function integerTypeOf(text: string): string | undefined {
  if (!(NUMBER.test(text) || LONG.test(text))) {
    return undefined;
  }
  const value = BigInt(text.replaceAll('_', '').replace(/[lL]$/u, ''));
  if (value > LONG_MAX) {
    return undefined;
  }
  return LONG.test(text) || value > INT_MAX ? 'Long' : 'Int';
}

function realTypeOf(text: string): string | undefined {
  if (REAL.test(text)) {
    return 'Double';
  }
  return SINGLE.test(text) ? 'Float' : undefined;
}

function numberTypeOf({ type, text }: Node): string | undefined {
  if (type === 'float_literal') {
    return realTypeOf(text);
  }
  return type === 'number_literal' ? integerTypeOf(text) : undefined;
}

export function literalTypeOf(node: Node): string | undefined {
  const { type, text } = node;
  if (type === 'identifier') {
    return text === 'true' || text === 'false' ? 'Boolean' : undefined;
  }
  if (type === 'character_literal') {
    return 'Char';
  }
  if (type === 'string_literal') {
    return text.includes('$') ? undefined : 'String';
  }
  return numberTypeOf(node);
}

const READING_ROLES: Readonly<Record<Role, boolean>> = {
  reference: true,
  callee: true,
  member: false,
  declaration: false,
  other: false,
};
const REFERENCE: Role = 'reference';
const OTHER: Role = 'other';
const DECLARING_PARENTS = new Set([
  'variable_declaration',
  'parameter',
  'class_parameter',
  'catch_block',
]);
const NAMING_PARENTS = new Set(['function_declaration', 'class_declaration', 'object_declaration']);

function declarationRole(parent: Node, node: Node): Role {
  return parent.namedChildren[0]?.id === node.id ? 'declaration' : OTHER;
}

function argumentRole(parent: Node, node: Node): Role {
  return parent.child(1)?.type === '=' && parent.child(0)?.id === node.id ? OTHER : REFERENCE;
}

export function roleOf(node: Node): Role {
  const parent = parentOf(node);
  if (field(parent, 'label')?.id === node.id || NAMELESS_ROLES.has(parent.type)) {
    return OTHER;
  }
  if (parent.type === 'navigation_expression') {
    return parent.child(0)?.id === node.id ? REFERENCE : 'member';
  }
  if (parent.type === 'call_expression') {
    return parent.child(0)?.id === node.id ? 'callee' : REFERENCE;
  }
  if (DECLARING_PARENTS.has(parent.type)) {
    return declarationRole(parent, node);
  }
  if (parent.type === 'value_argument') {
    return argumentRole(parent, node);
  }
  return NAMING_PARENTS.has(parent.type) ? OTHER : REFERENCE;
}

export function isWritten(node: Node): boolean {
  const parent = parentOf(node);
  if (parent.type === 'assignment') {
    return field(parent, 'left')?.id === node.id;
  }
  return (
    parent.type === 'unary_expression' &&
    parent.children.some(({ type }) => type === '++' || type === '--')
  );
}

export function declaredNames(root: Node): Set<string> {
  const names = new Set(boundNames(root));
  names.delete('it');
  names.delete('field');
  return names;
}

export function modifierWords(fn: Node): string[] {
  const modifiers = codeParts(fn).find(({ type }) => type === 'modifiers');
  return modifiers === undefined ? [] : modifiers.text.split(/\s+/u);
}

export function modifiersProblem(fn: Node): string | undefined {
  const modifiers = codeParts(fn).find(({ type }) => type === 'modifiers');
  const annotated = modifiers?.children.some(({ type }) => type === 'annotation') === true;
  return annotated || !modifierWords(fn).every((word) => ALLOWED_MODIFIERS.has(word))
    ? 'a function has an annotation or a modifier the shared function cannot repeat'
    : undefined;
}

export function parameterNodes(fn: Node): Node[] {
  const list = codeParts(fn).find(({ type }) => type === 'function_value_parameters');
  return list === undefined ? [] : codeParts(list).filter(({ type }) => type === 'parameter');
}

function isPlainParameter(part: Node): boolean {
  const [name, colon, type, ...rest] = codeParts(part);
  return (
    name?.type === 'identifier' &&
    colon?.type === ':' &&
    type !== undefined &&
    isTypeNode(type) &&
    rest.length === 0
  );
}

export function hasPlainParameters(fn: Node): boolean {
  const list = codeParts(fn).find(({ type }) => type === 'function_value_parameters');
  return (
    list !== undefined &&
    codeParts(list).every((part) =>
      part.type === 'parameter' ? isPlainParameter(part) : ['(', ')', ','].includes(part.type),
    )
  );
}

export function parameterType(parameter: Node): string {
  return squashed(present(codeParts(parameter)[2]));
}

export function bodyOf(fn: Node): Node {
  return present(codeParts(fn).find(({ type }) => type === 'function_body'));
}

export function returnTypeOf(fn: Node): Node | undefined {
  const name = present(field(fn, 'name'));
  return codeParts(fn).find((child) => isTypeNode(child) && child.startIndex > name.startIndex);
}

export function isInLoop(node: Node, root: Node): boolean {
  return hasAncestorIn(node, root, LOOPS);
}

export function isJump(node: Node): boolean {
  return (node.type === 'identifier' && JUMPS.has(node.text)) || node.type === 'labeled_expression';
}

export function localDeclarationProblem(root: Node): string | undefined {
  const forbidden = new Set([
    FUNCTION,
    'class_declaration',
    'object_declaration',
    'object_literal',
    'super_expression',
  ]);
  const found = descendants(root).some(
    (node) =>
      forbidden.has(node.type) ||
      (node.type === 'call_expression' && node.child(0)?.text === 'contract'),
  );
  return found
    ? 'the code declares a local function or type, or calls super or contract'
    : undefined;
}

export function shadowProblem(fn: Node): string | undefined {
  const nodes = descendants(fn).filter(({ type }) => type === 'identifier');
  const firstDeclared = new Map<string, number>();
  for (const node of nodes) {
    const known = firstDeclared.get(node.text);
    if (roleOf(node) === 'declaration' && (known === undefined || node.startIndex < known)) {
      firstDeclared.set(node.text, node.startIndex);
    }
  }
  const early = nodes.some((node) => {
    const declared = firstDeclared.get(node.text);
    const role = roleOf(node);
    return declared !== undefined && node.startIndex < declared && READING_ROLES[role];
  });
  return early ? 'a name is read before a local of the same name is declared' : undefined;
}
