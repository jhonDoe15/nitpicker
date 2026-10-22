import ts from 'typescript';
import { findFunction } from './module-bindings.mjs';
import { loadProgram, locationOf } from './program.mjs';
import { bodyOf } from './statements.mjs';

export const ANALYZER_VERSION = 'flow-model-1';

function isSimpleElement(element) {
  return (
    element.dotDotDotToken === undefined &&
    element.initializer === undefined &&
    ts.isIdentifier(element.name)
  );
}

function register(locals, node, name) {
  const ordinal = locals.size + 1;
  locals.set(node, { kind: 'local', id: `${locals.fnName}:${name}#${String(ordinal)}`, name });
}

function registerDeclaration(locals, declaration) {
  if (ts.isIdentifier(declaration.name)) {
    register(locals, declaration, declaration.name.text);
    return;
  }
  if (!ts.isObjectBindingPattern(declaration.name)) {
    return;
  }
  register(locals, declaration, '$pattern');
  for (const element of declaration.name.elements.filter(isSimpleElement)) {
    register(locals, element, element.name.text);
  }
}

function collectLocals(fn, fnName) {
  const locals = new Map();
  locals.fnName = fnName;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node)) {
      registerDeclaration(locals, node);
    }
    if (!ts.isFunctionLike(node)) {
      ts.forEachChild(node, visit);
    }
  };
  ts.forEachChild(fn.body, visit);
  return locals;
}

function parameterModel(parameter, index, params) {
  const name = ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${String(index)}`;
  const root = { kind: 'param', index, name };
  if (ts.isIdentifier(parameter.name)) {
    params.set(parameter, root);
    return { index, name };
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
  const supported = simple.length === elements.length && ts.isObjectBindingPattern(parameter.name);
  return { index, name, fields: simple.map((element) => element.name.text), supported };
}

function extractFunction(fn, name, context) {
  const params = new Map();
  const parameters = fn.parameters.map((parameter, index) =>
    parameterModel(parameter, index, params),
  );
  const cx = { ...context, params, locals: collectLocals(fn, name), helpers: new Set() };
  const body = bodyOf(fn, cx);
  const model = { name, params: parameters, body, loc: locationOf(context.sourceFile, fn) };
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
    if (fn === undefined || functions[name] !== undefined) {
      missing.push(...(fn === undefined ? [name] : []));
      continue;
    }
    const extracted = extractFunction(fn, name, { sourceFile, checker });
    functions[name] = extracted.model;
    queue.push(...extracted.helpers);
  }
  if (functions[entry] === undefined) {
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
