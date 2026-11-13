import ts from 'typescript';
import type {
  Expr,
  ExtractContext,
  FlowModel,
  FunctionModel,
  FunctionNode,
  LocalExpr,
  ParamModel,
  ProgramContext,
} from '../model/syntax-types.mts';
import { depthFirst } from '../model/traversal.mts';
import { findFunction } from './module-bindings.mts';
import { bindingFieldName, loadProgram, locationOf } from './program.mts';
import { toExpr } from './expressions.mts';
import { bodyOf } from './statements.mts';

export const ANALYZER_VERSION = 'flow-model-3';

type SimpleElement = ts.BindingElement & { readonly name: ts.Identifier };

function isSimpleElement(element: ts.BindingElement): element is SimpleElement {
  return (
    element.dotDotDotToken === undefined &&
    element.initializer === undefined &&
    ts.isIdentifier(element.name)
  );
}

function register(
  locals: Map<ts.Node, LocalExpr>,
  { node, name, fnName }: { node: ts.Node; name: string; fnName: string },
): void {
  const ordinal = locals.size + 1;
  locals.set(node, { kind: 'local', id: `${fnName}:${name}#${String(ordinal)}`, name });
}

function registerDeclaration(
  locals: Map<ts.Node, LocalExpr>,
  declaration: ts.VariableDeclaration,
  fnName: string,
): void {
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

function bodyChildren(node: ts.Node): readonly ts.Node[] {
  return ts.isFunctionLike(node) ? [] : node.getChildren();
}

function collectLocals(fn: FunctionNode, fnName: string): Map<ts.Node, LocalExpr> {
  const locals = new Map<ts.Node, LocalExpr>();
  const roots = fn.body.getChildren();
  const nodes = roots.flatMap((root) => depthFirst<ts.Node>(root, bodyChildren));
  for (const declaration of nodes.filter((node) => ts.isVariableDeclaration(node))) {
    registerDeclaration(locals, declaration, fnName);
  }
  return locals;
}

function modifiersOf(fn: FunctionNode): { async?: true; generator?: true } {
  const isAsync = (fn.modifiers ?? []).some((item) => item.kind === ts.SyntaxKind.AsyncKeyword);
  const generator = !ts.isArrowFunction(fn) && fn.asteriskToken !== undefined;
  return { ...(isAsync ? { async: true } : {}), ...(generator ? { generator: true } : {}) };
}

function parameterModel(
  parameter: ts.ParameterDeclaration,
  index: number,
  params: Map<ts.Node, Expr>,
): ParamModel {
  const name = ts.isIdentifier(parameter.name) ? parameter.name.text : `arg${String(index)}`;
  const root: Expr = { kind: 'param', index, name };
  const variadic = parameter.dotDotDotToken !== undefined;
  if (ts.isIdentifier(parameter.name)) {
    params.set(parameter, root);
    return variadic ? { index, name, supported: false } : { index, name };
  }
  const elements: readonly ts.BindingElement[] = ts.isObjectBindingPattern(parameter.name)
    ? parameter.name.elements
    : [];
  const simple = elements.filter(isSimpleElement);
  for (const element of simple) {
    params.set(element, { kind: 'get', object: root, field: bindingFieldName(element) });
  }
  const supported =
    simple.length === elements.length &&
    ts.isObjectBindingPattern(parameter.name) &&
    parameter.initializer === undefined &&
    !variadic;
  return { index, name, fields: simple.map((element) => element.name.text), supported };
}

function extractFunction(
  fn: FunctionNode,
  name: string,
  context: ProgramContext,
): { readonly model: FunctionModel; readonly helpers: string[] } {
  const params = new Map<ts.Node, Expr>();
  const parameters = fn.parameters.map((parameter, index) => ({
    parameter,
    model: parameterModel(parameter, index, params),
  }));
  const locals = collectLocals(fn, name);
  const cx: ExtractContext = {
    ...context,
    fnName: name,
    params,
    locals,
    helpers: new Set(),
    sites: new Map(),
  };
  const body = bodyOf(fn, cx);
  const withDefaults = parameters.map(({ parameter, model }) =>
    parameter.initializer !== undefined && ts.isIdentifier(parameter.name)
      ? { ...model, default: toExpr(parameter.initializer, cx) }
      : model,
  );
  const loc = locationOf(context.sourceFile, fn);
  const model = { name, params: withDefaults, ...modifiersOf(fn), body, loc };
  return { model, helpers: [...cx.helpers].sort() };
}

export function functionSourceBytes(
  { file, text }: { file: string; text: string },
  names: readonly string[],
): number {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const nodes = names
    .map((name) => findFunction(sourceFile, name))
    .filter((node) => node !== undefined);
  return nodes.reduce((total, node) => total + Buffer.byteLength(node.getText(sourceFile)), 0);
}

export function extractModel({
  file,
  text,
  entry,
}: {
  file: string;
  text: string;
  entry: string;
}): FlowModel {
  const { sourceFile, checker } = loadProgram({ file, text });
  const functions: Record<string, FunctionModel> = {};
  const missing: string[] = [];
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
