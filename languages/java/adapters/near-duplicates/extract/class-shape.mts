import type { Node } from 'web-tree-sitter';
import type { InstanceState, NameSets } from '../extract-types.mts';
import { boundNames } from '../tree/names.mts';
import {
  CLASS,
  METHOD,
  codeParts,
  descendants,
  field,
  namedChildren,
  pairOf,
  parametersOf,
  parentOf,
  present,
  required,
  squashed,
} from './syntax.mts';

const STATIC = 'static';
const TYPE_PARAMETERS = 'type_parameters';
const VARARGS = 'a method has varargs or a receiver parameter, or the parameter counts differ';
const CAPITALIZED = /^[A-Z]/u;
const CONSTANT_LIKE = /^[A-Z][A-Z0-9_]*$/u;
const INSTANCE = 'instance';
const AMBIGUOUS = 'ambiguous';
const NONE = 'none';
const MEMBER_FIELDS: Readonly<Record<string, string>> = {
  method_invocation: 'name',
  field_access: 'field',
};

export function hasModifier(node: Node, word: string): boolean {
  const modifiers = codeParts(node).find((child) => child.type === 'modifiers');
  return modifiers !== undefined && modifiers.text.split(/\s+/u).includes(word);
}

export function throwsOf(method: Node): string {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  return clause === undefined ? '' : squashed(clause);
}

function hasPlainParameters(method: Node): boolean {
  return namedChildren(required(method, 'parameters')).length === parametersOf(method).length;
}

const CLASS_LIKE = new Set([
  'class_declaration',
  'enum_declaration',
  'record_declaration',
  'interface_declaration',
]);

export function isAnonymous(method: Node): boolean {
  return (
    parentOf(method).type === 'class_body' &&
    parentOf(parentOf(method)).type === 'object_creation_expression'
  );
}

function classOwner(node: Node): Node | undefined {
  const pending = [node.parent];
  for (const current of pending) {
    if (current === null) {
      return undefined;
    }
    const isClassBody = current.type === 'class_body';
    if (
      CLASS_LIKE.has(current.type) ||
      (isClassBody && parentOf(current).type === 'object_creation_expression')
    ) {
      return CLASS_LIKE.has(current.type) ? current : undefined;
    }
    pending.push(current.parent);
  }
  return undefined;
}

export function enclosingClass(method: Node): Node | undefined {
  return isAnonymous(method) ? classOwner(parentOf(parentOf(method))) : undefined;
}

export function enclosingMember(method: Node): Node {
  const owner = present(enclosingClass(method));
  const chain = [parentOf(parentOf(method))];
  for (const current of chain) {
    if (parentOf(current).id === required(owner, 'body').id) {
      return current;
    }
    chain.push(parentOf(current));
  }
  return method;
}

const LOCAL_TYPES = new Set([
  'class_declaration',
  'record_declaration',
  'interface_declaration',
  'enum_declaration',
]);

function enclosingCallable(creation: Node): Node | undefined {
  const pending = [creation.parent];
  for (const current of pending) {
    if (current === null) {
      return undefined;
    }
    if (current.type === 'method_declaration' || current.type === 'constructor_declaration') {
      return current;
    }
    pending.push(current.parent);
  }
  return undefined;
}

function scopeProblem(method: Node): string | undefined {
  const callable = enclosingCallable(parentOf(parentOf(method)));
  if (callable === undefined) {
    return undefined;
  }
  const local = descendants(callable).some(
    (part) => part.id !== callable.id && LOCAL_TYPES.has(part.type),
  );
  return field(callable, TYPE_PARAMETERS) !== undefined || local
    ? 'an anonymous class sits in a generic method or next to a local type'
    : undefined;
}

function anonymousProblem(methods: readonly Node[]): string | undefined {
  const owners = methods.map(enclosingClass);
  const bodies = methods.map((method) =>
    codeParts(parentOf(method)).filter((part) => part.type !== '{' && part.type !== '}'),
  );
  if (
    owners.some((owner) => owner === undefined || owner.type !== CLASS) ||
    owners[0]?.id !== owners[1]?.id
  ) {
    return 'the copies are not in one class';
  }
  if (bodies.flat().some((part) => part.type !== METHOD)) {
    return 'an anonymous class declares more than methods';
  }
  return methods.map(scopeProblem).find((found) => found !== undefined);
}

function sameClassProblem(methods: readonly Node[], anonymous: boolean): string | undefined {
  const [a, b] = pairOf(methods);
  if (anonymous && methods.every(isAnonymous)) {
    return anonymousProblem(methods);
  }
  return parentOf(a).id !== parentOf(b).id || parentOf(parentOf(a)).type !== CLASS
    ? 'the copies are not in one class'
    : undefined;
}

export function classProblem(methods: readonly Node[], anonymous = false): string | undefined {
  const [a, b] = pairOf(methods);
  const checks: (readonly [boolean, string | undefined])[] = [
    [methods.some((method) => method.type !== METHOD), 'a copy is not a method'],
    [sameClassProblem(methods, anonymous) !== undefined, sameClassProblem(methods, anonymous)],
    [
      methods.some((method) => field(method, TYPE_PARAMETERS) !== undefined),
      'a method has type parameters',
    ],
    [hasModifier(a, STATIC) !== hasModifier(b, STATIC), 'only one copy is static'],
    [throwsOf(a) !== throwsOf(b), 'the copies declare different exceptions'],
  ];
  return checks.find(([failed]) => failed)?.[1];
}

export function parametersProblem(methods: readonly Node[]): string | undefined {
  const [a, b] = pairOf(methods);
  const unplain =
    !methods.every(hasPlainParameters) || parametersOf(a).length !== parametersOf(b).length;
  return unplain ? VARARGS : undefined;
}

export function methodProblem(methods: readonly Node[], anonymous = false): string | undefined {
  return classProblem(methods, anonymous) ?? parametersProblem(methods);
}

function declaredFields(classBody: Node, isStatic: boolean): Set<string> {
  const fields = codeParts(classBody).filter(
    (member) => member.type === 'field_declaration' && hasModifier(member, STATIC) === isStatic,
  );
  const declarators = fields.flatMap((member) =>
    codeParts(member).filter((child) => child.type === 'variable_declarator'),
  );
  return new Set(declarators.map((declarator) => required(declarator, 'name').text));
}

function memberNames(classBody: Node, kind: string, isStatic: boolean): Set<string> {
  const members = codeParts(classBody).filter(
    (member) => member.type === kind && hasModifier(member, STATIC) === isStatic,
  );
  return new Set(members.map((member) => required(member, 'name').text));
}

export function namesOf(method: Node): NameSets {
  const anonymous = isAnonymous(method);
  const owner = present(anonymous ? enclosingClass(method) : parentOf(parentOf(method)));
  const classBody = anonymous ? required(owner, 'body') : parentOf(method);
  return {
    staticFields: declaredFields(classBody, true),
    instanceFields: declaredFields(classBody, false),
    methods: memberNames(classBody, METHOD, true),
    instanceMethods: memberNames(classBody, METHOD, false),
    locals: boundNames(method),
    inner: memberNames(classBody, CLASS, false),
    inherits:
      anonymous ||
      field(owner, 'superclass') !== undefined ||
      field(owner, 'interfaces') !== undefined,
  };
}

function isMemberName(node: Node): boolean {
  const parent = parentOf(node);
  const member = MEMBER_FIELDS[parent.type];
  return member !== undefined && field(parent, member)?.id === node.id;
}

function readsName(node: Node, names: NameSets): InstanceState {
  if (isMemberName(node) || names.locals.has(node.text)) {
    return NONE;
  }
  if (names.instanceFields.has(node.text)) {
    return INSTANCE;
  }
  if (names.staticFields.has(node.text)) {
    return NONE;
  }
  if (!CAPITALIZED.test(node.text)) {
    return INSTANCE;
  }
  return names.inherits && CONSTANT_LIKE.test(node.text) ? AMBIGUOUS : NONE;
}

function callsMethod(node: Node, names: NameSets): InstanceState {
  const name = required(node, 'name').text;
  if (field(node, 'object') !== undefined) {
    return NONE;
  }
  if (!names.methods.has(name)) {
    return INSTANCE;
  }
  return names.instanceMethods.has(name) || names.inherits ? AMBIGUOUS : NONE;
}

function stateOf(node: Node, names: NameSets): InstanceState {
  if (node.type === 'this' || node.type === 'super') {
    return INSTANCE;
  }
  if (node.type === 'object_creation_expression') {
    return names.inner.has(field(node, 'type')?.text ?? '') ? INSTANCE : NONE;
  }
  if (node.type === 'method_invocation') {
    return callsMethod(node, names);
  }
  return node.type === 'identifier' ? readsName(node, names) : NONE;
}

export function isInside(node: Node, spans: readonly Node[]): boolean {
  return spans.some((span) => node.startIndex >= span.startIndex && node.endIndex <= span.endIndex);
}

export function instanceStateOf(
  method: Node,
  holeNodes: readonly Node[],
  roots: readonly Node[] = [required(method, 'body')],
): InstanceState {
  const names = namesOf(method);
  const states = roots
    .flatMap((root) => descendants(root))
    .filter((node) => !isInside(node, holeNodes))
    .map((node) => stateOf(node, names));
  if (states.includes(INSTANCE)) {
    return INSTANCE;
  }
  return states.includes(AMBIGUOUS) ? AMBIGUOUS : NONE;
}
