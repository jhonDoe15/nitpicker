import ts from 'typescript';
import {
  findVariable,
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
} from '../../analysis/constant-resolution.mjs';
import { leafValues, memberName, propertyNamed, unwrapped } from '../security-values.mjs';

const NO_VALUE = new Set(['undefined', 'null']);
const CALLBACK_NAME =
  /^(?:resolve|reject|cb|callback|done|next|handler|listener|on[A-Z]\w*|handle\w*)$/u;
const LOCAL_URL = /^(?:data|blob):/iu;
const LOCAL_URL_NAME = /^(?:data|blob|object)(?:Url|Uri|URL|URI)$/u;

function hasTypes(context) {
  const services = context.sourceCode.parserServices;
  return services?.program === undefined || services.program === null ? undefined : services;
}

export function isAbsent(context, node) {
  const leaves = leafValues(context, node);
  return leaves.every(
    (leaf) =>
      (leaf.type === 'Identifier' && NO_VALUE.has(leaf.name)) ||
      (leaf.type === 'Literal' &&
        (leaf.value === null || leaf.value === 0 || leaf.value === false)),
  );
}

function isUrlType(context, node) {
  const services = hasTypes(context);
  if (services === undefined) {
    return false;
  }
  const type = services.getTypeAtLocation(node);
  return (type.flags & ts.TypeFlags.StringLike) !== 0 || type.symbol?.name === 'URL';
}

export function typeNamed(context, node, name) {
  const services = hasTypes(context);
  return services !== undefined && services.getTypeAtLocation(node).getSymbol()?.getName() === name;
}

function hasCallSignature(context, node) {
  const services = hasTypes(context);
  return services !== undefined && services.getTypeAtLocation(node).getCallSignatures().length > 0;
}

export function isCallback(context, args, index) {
  const argument = unwrapped(args[index]);
  if (isFunctionNode(argument) || resolveFunction(context, argument) !== undefined) {
    return true;
  }
  if (index === 0 || (argument?.type !== 'Identifier' && argument?.type !== 'MemberExpression')) {
    return false;
  }
  const previous = unwrapped(resolveConstant(context, unwrapped(args[index - 1])));
  const afterOptions = previous?.type === 'ObjectExpression';
  const named = argument.type === 'Identifier' && CALLBACK_NAME.test(argument.name);
  return afterOptions || named || hasCallSignature(context, argument);
}

export function isLocalUrl(context, node) {
  const target = unwrapped(resolveConstant(context, unwrapped(node)));
  if (target === undefined) {
    return false;
  }
  const text =
    stringValue(target) ??
    (target.type === 'TemplateLiteral' ? target.quasis[0].value.cooked : undefined);
  if (text !== undefined) {
    return LOCAL_URL.test(text);
  }
  if (target.type === 'Identifier') {
    return LOCAL_URL_NAME.test(target.name);
  }
  const base = target.type === 'NewExpression' ? unwrapped(target.arguments[1]) : undefined;
  const isMetaUrl =
    base?.type === 'MemberExpression' &&
    base.object.type === 'MetaProperty' &&
    memberName(base) === 'url';
  const isObjectUrl =
    target.type === 'CallExpression' &&
    target.callee.type === 'MemberExpression' &&
    memberName(target.callee) === 'createObjectURL';
  return isMetaUrl || isObjectUrl;
}

function laterWrites(context, node, keys) {
  const identifier = unwrapped(node);
  if (identifier?.type !== 'Identifier') {
    return undefined;
  }
  const variable = findVariable(context, identifier, identifier.name);
  const states = (variable?.references ?? []).map((reference) => {
    const owner = reference.identifier.parent;
    const write =
      owner.type === 'MemberExpression' &&
      owner.object === reference.identifier &&
      owner.parent.type === 'AssignmentExpression' &&
      owner.parent.left === owner &&
      keys.includes(memberName(owner));
    if (write) {
      return isAbsent(context, owner.parent.right) ? 'missing' : 'set';
    }
    const assigned =
      owner.type === 'CallExpression' &&
      owner.arguments[0] === reference.identifier &&
      owner.callee.type === 'MemberExpression' &&
      memberName(owner.callee) === 'assign';
    return assigned ? 'unknown' : undefined;
  });
  return states.find((state) => state === 'set') ?? states.find((state) => state === 'unknown');
}

function objectState(context, resolved, keys) {
  for (const key of keys) {
    const value = propertyNamed(context, resolved, key);
    if (value !== undefined) {
      return isAbsent(context, value) ? 'missing' : 'set';
    }
  }
  const spreads = resolved.properties.filter((entry) => entry.type === 'SpreadElement');
  const resolvable = spreads.every(
    (entry) =>
      unwrapped(resolveConstant(context, unwrapped(entry.argument))).type === 'ObjectExpression',
  );
  return resolvable ? 'missing' : 'unknown';
}

export function configState(context, node, keys) {
  if (node === undefined) {
    return 'missing';
  }
  const resolved = unwrapped(resolveConstant(context, unwrapped(node)));
  if (
    resolved.type === 'Literal' ||
    resolved.type === 'TemplateLiteral' ||
    isUrlType(context, node)
  ) {
    return 'url';
  }
  if (resolved.type !== 'ObjectExpression') {
    return isAbsent(context, resolved) ? 'missing' : 'unknown';
  }
  const state = objectState(context, resolved, keys);
  return state === 'set' ? state : (laterWrites(context, node, keys) ?? state);
}

export function lacksTimeout(context, nodes, keys) {
  const states = nodes.map((node) => configState(context, node, keys));
  return !states.includes('set') && !states.includes('unknown');
}

export function configNodes(context, args) {
  const object = args
    .slice(0, 2)
    .find(
      (argument) =>
        unwrapped(resolveConstant(context, unwrapped(argument)))?.type === 'ObjectExpression',
    );
  return object === undefined ? [args[1]] : [object];
}
