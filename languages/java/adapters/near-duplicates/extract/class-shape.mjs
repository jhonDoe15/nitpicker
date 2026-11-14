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
const CAPITALIZED = /^[A-Z]/u;
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

export function methodProblem(methods) {
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
    [
      !methods.every(hasPlainParameters) || parametersOf(a).length !== parametersOf(b).length,
      'a method has varargs or a receiver parameter, or the parameter counts differ',
    ],
  ];
  return checks.find(([failed]) => failed)?.[1];
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
  return {
    staticFields: declaredFields(classBody, true),
    instanceFields: declaredFields(classBody, false),
    methods: memberNames(classBody, METHOD, true),
    locals: boundNames(method),
    inner: memberNames(classBody, CLASS, false),
  };
}

function isMemberName(node) {
  const { parent } = node;
  const member = MEMBER_FIELDS[parent.type];
  return member !== undefined && field(parent, member)?.id === node.id;
}

function readsName(node, names) {
  if (isMemberName(node) || names.locals.has(node.text)) {
    return false;
  }
  if (names.instanceFields.has(node.text)) {
    return true;
  }
  return !(names.staticFields.has(node.text) || CAPITALIZED.test(node.text));
}

function readsInstanceState(node, names) {
  if (node.type === 'this' || node.type === 'super') {
    return true;
  }
  if (node.type === 'object_creation_expression') {
    return names.inner.has(field(node, 'type')?.text);
  }
  if (node.type === 'method_invocation') {
    return field(node, 'object') === undefined && !names.methods.has(field(node, 'name').text);
  }
  return node.type === 'identifier' && readsName(node, names);
}

function isInside(node, spans) {
  return spans.some((span) => node.startIndex >= span.startIndex && node.endIndex <= span.endIndex);
}

export function usesInstanceState(method, holeNodes) {
  const names = namesOf(method);
  return descendants(field(method, 'body')).some(
    (node) => !isInside(node, holeNodes) && readsInstanceState(node, names),
  );
}

export function canDeclareStatics(method) {
  const owner = method.parent.parent;
  const isGeneric = field(owner, 'type_parameters') !== undefined;
  return !isGeneric && (owner.parent.type === 'program' || hasModifier(owner, STATIC));
}
