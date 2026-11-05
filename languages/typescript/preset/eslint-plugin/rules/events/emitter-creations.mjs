import { bindingsOf, importedFunction, isModuleValue } from '../security/imported-names.mjs';
import { typeServices, unwrapped } from '../security/security-values.mjs';
import { EMITTER_SOURCES, EMITTER_TYPES } from './emitter-modules.mjs';

const TYPESCRIPT_FILE = /\.[cm]?tsx?$/u;
const MODULE_PATH = /\/node_modules\/(?:@types\/)?((?:@[^/]+\/)?[^/]+)\//gu;
const MAX_BASES = 32;

export function createBindings(program) {
  const cache = new Map();
  return (modules) => {
    if (!cache.has(modules)) {
      cache.set(modules, bindingsOf(program, modules));
    }
    return cache.get(modules);
  };
}

export function importedName(context, node, bindings) {
  return importedFunction(context, unwrapped(node), bindings);
}

export function calledName(context, node, bindings) {
  const callee = unwrapped(node.callee);
  if (node.type === 'NewExpression' && isModuleValue(context, callee, bindings)) {
    return 'default';
  }
  return importedFunction(context, callee, bindings);
}

function sourceOf(context, node, bindingsFor, field) {
  return EMITTER_SOURCES.find((entry) =>
    entry[field].has(calledName(context, node, bindingsFor(entry.modules))),
  );
}

export function moduleOfFile(fileName) {
  const matches = [...fileName.replaceAll('\\', '/').matchAll(MODULE_PATH)];
  return matches.at(-1)?.[1];
}

function classChain(type) {
  const seen = new Set();
  const pending = [type];
  for (const current of pending) {
    const target = current.target ?? current;
    if (!seen.has(target) && seen.size < MAX_BASES) {
      seen.add(target);
      pending.push(...(target.getBaseTypes?.() ?? []));
    }
  }
  return [...seen];
}

function isEmitterClass(type) {
  const symbol = type.getSymbol();
  const names = EMITTER_TYPES.get(
    moduleOfFile(symbol?.declarations?.[0]?.getSourceFile().fileName ?? ''),
  );
  return names?.has(symbol.getName()) === true;
}

function isTypedEmitter(context, node) {
  const services = typeServices(context);
  if (services === undefined || !TYPESCRIPT_FILE.test(context.filename)) {
    return false;
  }
  return classChain(services.getTypeAtLocation(node)).some(isEmitterClass);
}

export function isEmitterCreation(context, node, bindingsFor) {
  const target = unwrapped(node);
  if (target?.type === 'CallExpression') {
    return sourceOf(context, target, bindingsFor, 'factories') !== undefined;
  }
  if (target?.type !== 'NewExpression') {
    return false;
  }
  return (
    sourceOf(context, target, bindingsFor, 'constructors') !== undefined ||
    isTypedEmitter(context, target)
  );
}

export function isServerCreation(context, node, bindingsFor) {
  const target = unwrapped(node);
  const isCreation = target?.type === 'CallExpression' || target?.type === 'NewExpression';
  return isCreation && sourceOf(context, target, bindingsFor, 'servers') !== undefined;
}
