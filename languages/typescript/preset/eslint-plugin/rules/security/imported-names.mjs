import { chainOf } from '../analysis/ancestry.mjs';
import { findVariable, resolveConstant, stringValue } from '../analysis/constant-resolution.mjs';
import { importedCalleeName, moduleBindings } from '../analysis/subprocess-calls.mjs';
import { DEPTHS, memberName, staticKey, unwrapped } from './security-values.mjs';

function loadedModuleCall(node) {
  const target = unwrapped(node);
  if (target?.type === 'ImportExpression') {
    return stringValue(target.source);
  }
  const isRequire =
    target?.type === 'CallExpression' &&
    target.callee.type === 'Identifier' &&
    target.callee.name === 'require';
  return isRequire ? stringValue(target.arguments[0]) : undefined;
}

function moduleStep(node) {
  const target = unwrapped(node);
  if (target?.type === 'AwaitExpression') {
    return target.argument;
  }
  return target?.type === 'MemberExpression' && memberName(target) === 'default'
    ? target.object
    : undefined;
}

export function loadedModule(node) {
  return loadedModuleCall(chainOf(node, moduleStep).at(-1));
}

function importEqualsModule(statement) {
  const reference = statement.moduleReference;
  return statement.type === 'TSImportEqualsDeclaration' &&
    reference?.type === 'TSExternalModuleReference'
    ? stringValue(reference.expression)
    : undefined;
}

function addPatternBindings(pattern, bindings) {
  for (const property of pattern.properties) {
    const key = staticKey(property);
    if (key !== undefined && property.value?.type === 'Identifier') {
      bindings.named.set(property.value.name, key);
    }
  }
}

function addDeclaratorBindings(declarator, modules, bindings) {
  if (!modules.has(loadedModule(declarator.init))) {
    return;
  }
  if (declarator.id.type === 'Identifier') {
    bindings.namespaces.add(declarator.id.name);
  }
  if (declarator.id.type === 'ObjectPattern') {
    addPatternBindings(declarator.id, bindings);
  }
}

function addLoadedBindings(statement, modules, bindings) {
  if (modules.has(importEqualsModule(statement))) {
    bindings.namespaces.add(statement.id.name);
  }
  const declarations = statement.type === 'VariableDeclaration' ? statement.declarations : [];
  for (const declarator of declarations) {
    addDeclaratorBindings(declarator, modules, bindings);
  }
}

export function bindingsOf(program, modules) {
  const base = moduleBindings(program, modules);
  const bindings = { named: new Map(), namespaces: new Set(base.namespaces), modules };
  for (const [local, imported] of base.named) {
    if (imported === 'default') {
      bindings.namespaces.add(local);
    } else {
      bindings.named.set(local, imported);
    }
  }
  for (const statement of program.body) {
    addLoadedBindings(statement, modules, bindings);
  }
  return bindings;
}

function isBindCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    memberName(node.callee) === 'bind'
  );
}

function unaliased(context, node) {
  return unwrapped(resolveConstant(context, unwrapped(node))) ?? node;
}

function aliasTarget(context, callee) {
  const start = unaliased(context, callee);
  return DEPTHS.reduce(
    (current) => (isBindCall(current) ? unaliased(context, current.callee.object) : current),
    start,
  );
}

export function isModuleValue(context, node, bindings) {
  const target = unaliased(context, node);
  if (target?.type === 'Identifier') {
    return bindings.namespaces.has(target.name);
  }
  return bindings.modules.has(loadedModule(target));
}

function destructuredName(context, node, bindings) {
  if (node.type !== 'Identifier') {
    return undefined;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  const pattern = definition?.node?.id;
  const fromModule = isModuleValue(context, definition?.node?.init, bindings);
  if (definition?.type !== 'Variable' || pattern?.type !== 'ObjectPattern' || !fromModule) {
    return undefined;
  }
  const property = pattern.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      (entry.value.name === node.name || entry.value.left?.name === node.name),
  );
  return property === undefined ? undefined : staticKey(property);
}

function moduleMemberName(context, target, bindings) {
  const isMember = target.type === 'MemberExpression' && !target.computed;
  return isMember && isModuleValue(context, target.object, bindings)
    ? memberName(target)
    : undefined;
}

export function importedFunction(context, callee, bindings) {
  const target = unwrapped(aliasTarget(context, callee));
  return (
    importedCalleeName(target, bindings) ??
    destructuredName(context, target, bindings) ??
    moduleMemberName(context, target, bindings)
  );
}
