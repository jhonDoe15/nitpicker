import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { parseProgram } from '../../../../../conventions/measures/parsing/estree-program.mts';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mts';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { readTextFile } from '../../react/support/file-reads.mts';
import { readStamped, type StampedCache } from '../../react/support/typed-sources.mts';
import type { FunctionNode } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { exportedFunction, type Found, type FunctionLookup } from './exported-functions.mts';
import { isReadOnlyBody, type IsRead } from './read-only-bodies.mts';

type Resolution = { readonly kind: string; readonly path?: string };

const resolveModuleSpecifier: (written: string, containingFile: string) => Resolution =
  untypedResolve;
const MAX_CHARACTERS = 500_000;
const MAX_HOPS = 4;
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const programs: StampedCache<TSESTree.Program | undefined> = new Map();
const verdicts = new WeakMap<TSESTree.Node, Map<string, { readonly readOnly: boolean }>>();

function readProgram(path: string): TSESTree.Program | undefined {
  const read = readTextFile(path);
  return read.kind === 'read' && read.text.length <= MAX_CHARACTERS && SOURCE.test(path)
    ? parseProgram(read.text, path).ast
    : undefined;
}

function parsedProgram(file: string): TSESTree.Program | undefined {
  return readStamped(programs, file, readProgram);
}

function lookedUp(lookup: FunctionLookup): Found | undefined {
  const resolved = resolveModuleSpecifier(lookup.specifier, lookup.file);
  const path = resolved.kind === 'file' ? resolved.path : undefined;
  const program = path === undefined ? undefined : parsedProgram(path);
  return path === undefined || program === undefined
    ? undefined
    : exportedFunction(program, path, lookup.name);
}

function importedFunction(file: string, specifier: string, name: string): FunctionNode | undefined {
  const pending: FunctionLookup[] = [{ file, specifier, name }];
  for (const lookup of pending) {
    const found = lookedUp(lookup);
    if (found?.kind === 'function') {
      return found.fn;
    }
    if (found?.kind === 'forwarded' && pending.length < MAX_HOPS) {
      pending.push(found.lookup);
    }
  }
  return undefined;
}

function importedName(definition: TSESLint.Scope.Definition): string | undefined {
  const { node } = definition;
  if (node.type === AST_NODE_TYPES.ImportDefaultSpecifier) {
    return 'default';
  }
  return node.type === AST_NODE_TYPES.ImportSpecifier &&
    node.imported.type === AST_NODE_TYPES.Identifier
    ? node.imported.name
    : undefined;
}

function variableFunction(declarator: TSESTree.VariableDeclarator): TSESTree.Node | undefined {
  const { init, parent } = declarator;
  return parent.kind === 'const' && init && isFunction(init) ? init : undefined;
}

function importedDefinition(
  definition: TSESLint.Scope.Definition,
  filename: string,
): TSESTree.Node | undefined {
  const name =
    definition.type === TSESLint.Scope.DefinitionType.ImportBinding
      ? importedName(definition)
      : undefined;
  const source = definition.parent;
  return name !== undefined &&
    source?.type === AST_NODE_TYPES.ImportDeclaration &&
    source.importKind !== 'type'
    ? importedFunction(filename, source.source.value, name)
    : undefined;
}

function calledFunction(
  callee: TSESTree.Identifier,
  sourceCode: TSESLint.SourceCode,
  filename: string,
): TSESTree.Node | undefined {
  const variable = findVariable({ sourceCode }, callee, callee.name);
  const [definition, ...others] = variable?.defs ?? [];
  if (definition === undefined || others.length > 0) {
    return undefined;
  }
  if (definition.type === TSESLint.Scope.DefinitionType.FunctionName) {
    return definition.node;
  }
  return definition.type === TSESLint.Scope.DefinitionType.Variable
    ? variableFunction(definition.node)
    : importedDefinition(definition, filename);
}

type ReadOnlyQuery = {
  readonly call: TSESTree.CallExpression;
  readonly context: { readonly sourceCode: TSESLint.SourceCode; readonly filename: string };
  readonly isRead: IsRead;
  readonly optionsKey: string;
};

export function callsReadOnlyFunction({
  call,
  context,
  isRead,
  optionsKey,
}: ReadOnlyQuery): boolean {
  const { callee } = call;
  if (callee.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const fn = calledFunction(callee, context.sourceCode, context.filename);
  if (fn === undefined || !isFunction(fn)) {
    return false;
  }
  const known = cachedValue(verdicts, fn, () => new Map<string, { readonly readOnly: boolean }>());
  return cachedValue(known, optionsKey, () => ({ readOnly: isReadOnlyBody(fn, isRead) })).readOnly;
}
