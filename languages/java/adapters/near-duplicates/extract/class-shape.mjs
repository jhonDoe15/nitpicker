import { boundNames } from '../tree/names.mjs';
import {
  CLASS,
  METHOD,
  codeParts,
  descendants,
  field,
  namedChildren,
  parametersOf,
  squashed,
} from './syntax.mjs';

const STATIC = 'static';
const TYPE_PARAMETERS = 'type_parameters';
const VARARGS = 'a method has varargs or a receiver parameter, or the parameter counts differ';
const CAPITALIZED = /^[A-Z]/u;
const CONSTANT_LIKE = /^[A-Z][A-Z0-9_]*$/u;
const INSTANCE = 'instance';
const AMBIGUOUS = 'ambiguous';
const NONE = 'none';
const MEMBER_FIELDS = { method_invocation: 'name', field_access: 'field' };

export function hasModifier(node, word) {
  const modifiers = codeParts(node).find((child) => child.type === 'modifiers');
  return modifiers !== undefined && modifiers.text.split(/\s+/u).includes(word);
}

export function throwsOf(method) {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  return clause === undefined ? '' : squashed(clause);
}

function hasPlainParameters(method) {
  return namedChildren(field(method, 'parameters')).length === parametersOf(method).length;
}

const CLASS_LIKE = new Set([
  'class_declaration',
  'enum_declaration',
  'record_declaration',
  'interface_declaration',
]);

export function isAnonymous(method) {
  return (
    method.parent.type === 'class_body' &&
    method.parent.parent.type === 'object_creation_expression'
  );
}

function classOwner(node) {
  const pending = [node.parent];
  for (const current of pending) {
    if (current === null) {
      return undefined;
    }
    const isClassBody = current.type === 'class_body';
    if (
      CLASS_LIKE.has(current.type) ||
      (isClassBody && current.parent.type === 'object_creation_expression')
    ) {
      return CLASS_LIKE.has(current.type) ? current : undefined;
    }
    pending.push(current.parent);
  }
  return undefined;
}

function enclosingClass(method) {
  return isAnonymous(method) ? classOwner(method.parent.parent) : undefined;
}

export function enclosingMember(method) {
  const owner = enclosingClass(method);
  const chain = [method.parent.parent];
  for (const current of chain) {
    if (current.parent.id === owner.childForFieldName('body').id) {
      return current;
    }
    chain.push(current.parent);
  }
  return method;
}

const LOCAL_TYPES = new Set([
  'class_declaration',
  'record_declaration',
  'interface_declaration',
  'enum_declaration',
]);

function enclosingCallable(creation) {
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

function scopeProblem(method) {
  const callable = enclosingCallable(method.parent.parent);
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

function anonymousProblem(methods) {
  const owners = methods.map(enclosingClass);
  const bodies = methods.map((method) =>
    codeParts(method.parent).filter((part) => part.type !== '{' && part.type !== '}'),
  );
  if (
    owners.some((owner) => owner === undefined || owner.type !== CLASS) ||
    owners[0].id !== owners[1].id
  ) {
    return 'the copies are not in one class';
  }
  if (bodies.flat().some((part) => part.type !== METHOD)) {
    return 'an anonymous class declares more than methods';
  }
  return methods.map(scopeProblem).find((found) => found !== undefined);
}

function sameClassProblem(methods, anonymous) {
  const [a, b] = methods;
  if (anonymous && methods.every(isAnonymous)) {
    return anonymousProblem(methods);
  }
  return a.parent.id !== b.parent.id || a.parent.parent.type !== CLASS
    ? 'the copies are not in one class'
    : undefined;
}

export function classProblem(methods, anonymous = false) {
  const [a, b] = methods;
  const checks = [
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

export function parametersProblem(methods) {
  const [a, b] = methods;
  const unplain =
    !methods.every(hasPlainParameters) || parametersOf(a).length !== parametersOf(b).length;
  return unplain ? VARARGS : undefined;
}

export function methodProblem(methods, anonymous = false) {
  return classProblem(methods, anonymous) ?? parametersProblem(methods);
}

function declaredFields(classBody, isStatic) {
  const fields = codeParts(classBody).filter(
    (member) => member.type === 'field_declaration' && hasModifier(member, STATIC) === isStatic,
  );
  const declarators = fields.flatMap((member) =>
    codeParts(member).filter((child) => child.type === 'variable_declarator'),
  );
  return new Set(declarators.map((declarator) => field(declarator, 'name').text));
}

function memberNames(classBody, kind, isStatic) {
  const members = codeParts(classBody).filter(
    (member) => member.type === kind && hasModifier(member, STATIC) === isStatic,
  );
  return new Set(members.map((member) => field(member, 'name').text));
}

export function namesOf(method) {
  const anonymous = isAnonymous(method);
  const owner = anonymous ? enclosingClass(method) : method.parent.parent;
  const classBody = anonymous ? owner.childForFieldName('body') : method.parent;
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

function isMemberName(node) {
  const { parent } = node;
  const member = MEMBER_FIELDS[parent.type];
  return member !== undefined && field(parent, member)?.id === node.id;
}

function readsName(node, names) {
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

function callsMethod(node, names) {
  const name = field(node, 'name').text;
  if (field(node, 'object') !== undefined) {
    return NONE;
  }
  if (!names.methods.has(name)) {
    return INSTANCE;
  }
  return names.instanceMethods.has(name) || names.inherits ? AMBIGUOUS : NONE;
}

function stateOf(node, names) {
  if (node.type === 'this' || node.type === 'super') {
    return INSTANCE;
  }
  if (node.type === 'object_creation_expression') {
    return names.inner.has(field(node, 'type')?.text) ? INSTANCE : NONE;
  }
  if (node.type === 'method_invocation') {
    return callsMethod(node, names);
  }
  return node.type === 'identifier' ? readsName(node, names) : NONE;
}

export function isInside(node, spans) {
  return spans.some((span) => node.startIndex >= span.startIndex && node.endIndex <= span.endIndex);
}

export function instanceStateOf(method, holeNodes, roots = [field(method, 'body')]) {
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

function canDeclareStatics(method) {
  const owner = enclosingClass(method) ?? method.parent.parent;
  const isGeneric = field(owner, TYPE_PARAMETERS) !== undefined;
  return !isGeneric && (owner.parent.type === 'program' || hasModifier(owner, STATIC));
}

export const HELPER_AMBIGUOUS =
  'the code may use instance state of the class, which the shared function cannot tell';

export function helperStyleOf(method, holeNodes, roots) {
  if (hasModifier(method, STATIC)) {
    return 'static';
  }
  if (!canDeclareStatics(method)) {
    return 'instance';
  }
  const state = instanceStateOf(method, holeNodes, roots);
  return { [INSTANCE]: 'instance', [AMBIGUOUS]: undefined, [NONE]: 'static' }[state];
}
