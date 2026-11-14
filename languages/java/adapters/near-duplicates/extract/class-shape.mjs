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

function throwsOf(method) {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  return clause === undefined ? '' : squashed(clause);
}

function hasPlainParameters(method) {
  return namedChildren(field(method, 'parameters')).length === parametersOf(method).length;
}

export function classProblem(methods) {
  const [a, b] = methods;
  const checks = [
    [methods.some((method) => method.type !== METHOD), 'a copy is not a method'],
    [
      a.parent.id !== b.parent.id || a.parent.parent.type !== CLASS,
      'the copies are not in one class',
    ],
    [
      methods.some((method) => field(method, 'type_parameters') !== undefined),
      'a method has type parameters',
    ],
    [hasModifier(a, STATIC) !== hasModifier(b, STATIC), 'only one copy is static'],
    [throwsOf(a) !== throwsOf(b), 'the copies declare different exceptions'],
  ];
  return checks.find(([failed]) => failed)?.[1];
}

export function methodProblem(methods) {
  const [a, b] = methods;
  const unplain =
    !methods.every(hasPlainParameters) || parametersOf(a).length !== parametersOf(b).length;
  return classProblem(methods) ?? (unplain ? VARARGS : undefined);
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

function namesOf(method) {
  const classBody = method.parent;
  const owner = classBody.parent;
  return {
    staticFields: declaredFields(classBody, true),
    instanceFields: declaredFields(classBody, false),
    methods: memberNames(classBody, METHOD, true),
    instanceMethods: memberNames(classBody, METHOD, false),
    locals: boundNames(method),
    inner: memberNames(classBody, CLASS, false),
    inherits: field(owner, 'superclass') !== undefined || field(owner, 'interfaces') !== undefined,
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

function isInside(node, spans) {
  return spans.some((span) => node.startIndex >= span.startIndex && node.endIndex <= span.endIndex);
}

function instanceStateOf(method, holeNodes, roots = [field(method, 'body')]) {
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
  const owner = method.parent.parent;
  const isGeneric = field(owner, 'type_parameters') !== undefined;
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
