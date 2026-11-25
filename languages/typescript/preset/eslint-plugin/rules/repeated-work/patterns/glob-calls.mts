import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { libraryBinding, variableOf } from '../../../../libraries/module-bindings.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';

export type PatternCall = { readonly name: string; readonly pattern: TSESTree.Node };
type Library = 'path' | 'minimatch' | 'picomatch' | 'micromatch';
type Namespace = Exclude<Library, 'path'>;
type Binding = { readonly library: Library; readonly name: string | undefined };

const MINIMATCH = 'minimatch';
const PICOMATCH = 'picomatch';
const MICROMATCH = 'micromatch';
const MAKE_RE = 'makeRe';
const LIBRARIES: readonly Library[] = ['path', MINIMATCH, PICOMATCH, MICROMATCH];
const PACKAGES: Readonly<Record<Library, readonly string[]>> = {
  path: ['path', 'node:path'],
  minimatch: [MINIMATCH],
  picomatch: [PICOMATCH],
  micromatch: [MICROMATCH],
};
const PATH_FLAVOURS = new Set(['posix', 'win32']);
const LIST_METHODS = new Set([
  'all',
  'any',
  'contains',
  'every',
  'isMatch',
  'match',
  'not',
  'some',
]);
const COMPILING_METHODS: ReadonlyMap<Namespace, ReadonlyMap<string, number>> = new Map([
  [
    MINIMATCH,
    new Map([
      ['match', 1],
      [MAKE_RE, 0],
      ['filter', 0],
    ]),
  ],
  [
    PICOMATCH,
    new Map([
      ['isMatch', 1],
      [MAKE_RE, 0],
    ]),
  ],
  [
    MICROMATCH,
    new Map([
      ['matcher', 0],
      [MAKE_RE, 0],
    ]),
  ],
]);

function bindingOf(sourceCode: SourceCode, node: TSESTree.Node): Binding | undefined {
  const identifier = unwrapped(node);
  if (identifier.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const variable = variableOf(sourceCode, identifier);
  for (const library of LIBRARIES) {
    const binding = libraryBinding(variable, PACKAGES[library]);
    if (binding !== undefined) {
      return { library, name: binding.name };
    }
  }
  return undefined;
}

function isBarePath(binding: Binding | undefined): boolean {
  return binding?.library === 'path' && binding.name === undefined;
}

function isPathModule(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const object = unwrapped(node);
  const binding = bindingOf(sourceCode, object);
  if (binding?.library === 'path') {
    return binding.name === undefined || PATH_FLAVOURS.has(binding.name);
  }
  return (
    object.type === AST_NODE_TYPES.MemberExpression &&
    !object.computed &&
    object.property.type === AST_NODE_TYPES.Identifier &&
    PATH_FLAVOURS.has(object.property.name) &&
    isBarePath(bindingOf(sourceCode, object.object))
  );
}

function namespaceOf(binding: Binding | undefined): Namespace | undefined {
  const library = binding?.library;
  if (binding === undefined || library === undefined || library === 'path') {
    return undefined;
  }
  return binding.name === undefined || binding.name === library ? library : undefined;
}

function argumentAt(call: TSESTree.CallExpression | TSESTree.NewExpression, index: number) {
  const argument = call.arguments[index];
  const spread = call.arguments
    .slice(0, index + 1)
    .some((each) => each.type === AST_NODE_TYPES.SpreadElement);
  return argument === undefined || spread ? undefined : argument;
}

function found(
  call: TSESTree.CallExpression | TSESTree.NewExpression,
  name: string,
  index: number | undefined,
): PatternCall | undefined {
  const pattern = index === undefined ? undefined : argumentAt(call, index);
  return pattern === undefined ? undefined : { name, pattern };
}

function directCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
  callee: TSESTree.Identifier,
): PatternCall | undefined {
  const binding = bindingOf(sourceCode, callee);
  if (binding === undefined) {
    return undefined;
  }
  if (call.type === AST_NODE_TYPES.NewExpression) {
    return binding.library === MINIMATCH && binding.name === 'Minimatch'
      ? found(call, `new ${callee.name}`, 0)
      : undefined;
  }
  if (binding.library === 'path') {
    return binding.name === 'matchesGlob' ? found(call, callee.name, 1) : undefined;
  }
  const library = namespaceOf(binding);
  const index = { minimatch: 1, picomatch: 0, micromatch: 1 } as const;
  return library === undefined ? undefined : found(call, callee.name, index[library]);
}

function memberCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
  callee: TSESTree.MemberExpression,
): PatternCall | undefined {
  if (callee.computed || callee.property.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  const method = callee.property.name;
  const text = `${sourceCode.getText(callee.object)}.${method}`;
  if (call.type === AST_NODE_TYPES.NewExpression) {
    return method === 'Minimatch' && namespaceOf(bindingOf(sourceCode, callee.object)) === MINIMATCH
      ? found(call, `new ${text}`, 0)
      : undefined;
  }
  if (method === 'matchesGlob' && isPathModule(sourceCode, callee.object)) {
    return found(call, text, 1);
  }
  const library = namespaceOf(bindingOf(sourceCode, callee.object));
  if (library === undefined) {
    return undefined;
  }
  const index =
    library === MICROMATCH && LIST_METHODS.has(method)
      ? 1
      : COMPILING_METHODS.get(library)?.get(method);
  return found(call, text, index);
}

export function patternCall(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression | TSESTree.NewExpression,
): PatternCall | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return directCall(sourceCode, call, callee);
  }
  return callee.type === AST_NODE_TYPES.MemberExpression
    ? memberCall(sourceCode, call, callee)
    : undefined;
}
