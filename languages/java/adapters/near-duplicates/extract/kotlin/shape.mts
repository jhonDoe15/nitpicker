import type { Node } from 'web-tree-sitter';
import type { Pair } from '../../extract-types.mts';
import { codeParts, field, pairOf, parentOf, present } from '../syntax.mts';
import {
  FUNCTION,
  hasPlainParameters,
  modifierWords,
  modifiersProblem,
  shadowProblem,
} from './syntax.mts';

const OWNERS = new Set(['class_declaration', 'object_declaration', 'companion_object']);

function ownerProblem(parent: Node): string | undefined {
  if (parent.type === 'source_file') {
    return undefined;
  }
  const owner = parent.type === 'class_body' ? parentOf(parent) : undefined;
  if (owner === undefined || !OWNERS.has(owner.type)) {
    return 'the copies are not members of a class, an object or the file';
  }
  return owner.children.some(({ type }) => type === 'interface')
    ? 'the copies are members of an interface'
    : undefined;
}

function headProblem(fn: Node): string | undefined {
  const name = present(field(fn, 'name'));
  const head = codeParts(fn).filter(({ endIndex }) => endIndex <= name.startIndex);
  if (!head.every(({ type }) => type === 'modifiers' || type === 'fun')) {
    return 'a function has type parameters or a receiver';
  }
  return hasPlainParameters(fn)
    ? modifiersProblem(fn)
    : 'a function has default values, varargs or annotated parameters';
}

export function pairProblem(methods: Pair): string | undefined {
  const [a, b] = pairOf(methods);
  if (methods.some(({ type }) => type !== FUNCTION)) {
    return 'a copy is not a function';
  }
  if (parentOf(a).id !== parentOf(b).id) {
    return 'the copies are not in one class or file';
  }
  const problem =
    ownerProblem(parentOf(a)) ??
    headProblem(a) ??
    headProblem(b) ??
    shadowProblem(a) ??
    shadowProblem(b);
  if (problem !== undefined) {
    return problem;
  }
  return modifierWords(a).includes('suspend') === modifierWords(b).includes('suspend')
    ? undefined
    : 'only one copy is suspending';
}
