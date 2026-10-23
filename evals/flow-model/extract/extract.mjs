import ts from 'typescript';
import { depthFirst } from '../../../shared/traversal.mjs';
import { findFunction } from './module-bindings.mjs';
import { loadProgram, locationOf } from './program.mjs';
import { toExpr } from './expressions.mjs';
import { bodyOf } from './statements.mjs';

export const ANALYZER_VERSION = 'flow-model-3';

function isSimpleElement(element) {
  return (
    element.dotDotDotToken === undefined &&
    element.initializer === undefined &&
    ts.isIdentifier(element.name)
  );
}

function register(locals, { node, name, fnName }) {
  const ordinal = locals.size + 1;
  locals.set(node, { kind: 'local', id: `${fnName}:${name}#${String(ordinal)}`, name });
}

function registerDeclaration(locals, declaration, fnName) {
  if (ts.isIdentifier(declaration.name)) {
    register(locals, { node: declaration, name: declaration.name.text, fnName });
    return;
  }
  if (!ts.isObjectBindingPattern(declaration.name)) {
    return;
  }
  register(locals, { node: declaration, name: '$pattern', fnName });
  for (const element of declaration.name.elements.filter(isSimpleElement)) {
    register(locals, { node: element, name: element.name.text, fnName });
  }
}

function bodyChildren(node) {
  return ts.isFunctionLike(node) ? [] : node.getChildren();
}

function collectLocals(fn, fnName) {
  const locals = new Map();
  const roots = fn.body.getChildren();
  const nodes = roots.flatMap((root) => [...depthFirst(root, bodyChildren)]);
  for (const declaration of nodes.filter((node) => ts.isVariableDeclaration(node))) {
    registerDeclaration(locals, declaration, fnName);
  }
  return locals;
}

function modifiersOf(fn) {
  const isAsync = (fn.modifiers ?? []).some((item) => item.kind === ts.SyntaxKind.AsyncKeyword);
  return { ...(isAsync ? { async: true } : {}), ...(fn.asteriskToken ? { generator: true } : {}) };
}

function parameterModel(parameter, index, params) {
  const name = ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${String(index)}`;
  const root = { kind: 'param', index, name };
  const variadic = parameter.dotDotDotToken !== undefined;
  if (ts.isIdentifier(parameter.name)) {
    params.set(parameter, root);
    return variadic ? { index, name, supported: false } : { index, name };
  }
  const elements = ts.isObjectBindingPattern(parameter.name) ? parameter.name.elements : [];
  const simple = elements.filter(isSimpleElement);
  for (const element of simple) {
    params.set(element, {
      kind: 'get',
      object: root,
      field: (element.propertyName ?? element.name).text,
    });
  }
  const supported =
    simple.length === elements.length &&
    ts.isObjectBindingPattern(parameter.name) &&
    parameter.initializer === undefined &&
    !variadic;
  return { index, name, fields: simple.map((element) => element.name.text), supported };
}

function extractFunction(fn, name, context) {
  const params = new Map();
  const parameters = fn.parameters.map((parameter, index) =>
    parameterModel(parameter, index, params),
  );
  const locals = collectLocals(fn, name);
  const cx = { ...context, fnName: name, params, locals, helpers: new Set(), sites: new Map() };
  const body = bodyOf(fn, cx);
  for (const [index, parameter] of fn.parameters.entries()) {
    if (parameter.initializer !== undefined && ts.isIdentifier(parameter.name)) {
      parameters[index].default = toExpr(parameter.initializer, cx);
    }
  }
  const loc = locationOf(context.sourceFile, fn);
  const model = { name, params: parameters, ...modifiersOf(fn), body, loc };
  return { model, helpers: [...cx.helpers].sort() };
}

export function functionSourceBytes({ file, text }, names) {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const nodes = names
    .map((name) => findFunction(sourceFile, name))
    .filter((node) => node !== undefined);
  return nodes.reduce((total, node) => total + Buffer.byteLength(node.getText(sourceFile)), 0);
}

export function extractModel({ file, text, entry }) {
  const { sourceFile, checker } = loadProgram({ file, text });
  const functions = {};
  const missing = [];
  const queue = [entry];
  for (const name of queue) {
    const fn = findFunction(sourceFile, name);
    if (fn === undefined || Object.hasOwn(functions, name)) {
      missing.push(...(fn === undefined ? [name] : []));
      continue;
    }
    const extracted = extractFunction(fn, name, { sourceFile, checker });
    functions[name] = extracted.model;
    queue.push(...extracted.helpers);
  }
  if (!Object.hasOwn(functions, entry)) {
    throw new Error(`flow-model: entry function ${entry} not found in ${file}`);
  }
  return {
    analyzer: ANALYZER_VERSION,
    file,
    entry,
    functions,
    missingHelpers: [...new Set(missing)].sort(),
  };
}
