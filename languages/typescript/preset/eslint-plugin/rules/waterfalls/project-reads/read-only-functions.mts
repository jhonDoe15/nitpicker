import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';
import { parseProgram } from '../../../../../conventions/measures/parsing/estree-program.mts';
import { resolveModuleSpecifier as untypedResolve } from '../../../../modules/module-resolution.mts';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { readTextFile } from '../../react/support/file-reads.mts';
import { readStamped, type StampedCache } from '../../react/support/typed-sources.mts';
import { isFunction } from '../../typed/syntax-views.mts';
import { exportedFunction, type FunctionLookup } from './exported-functions.mts';
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

function importedFunction(
  file: string,
  specifier: string,
  name: string,
): TSESTree.FunctionLike | undefined {
  const pending: FunctionLookup[] = [{ file, specifier, name }];
  for (const lookup of pending) {
    const resolved = resolveModuleSpecifier(lookup.specifier, lookup.file);
    const program =
      resolved.kind === 'file' && resolved.path !== undefined
        ? parsedProgram(resolved.path)
        : undefined;
    const found =
      program === undefined || resolved.path === undefined
        ? undefined
        : exportedFunction(program, resolved.path, lookup.name);
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
  if (definition.type === TSESLint.Scope.DefinitionType.Variable) {
    const { init, parent } = definition.node;
    return parent.kind === 'const' && init && isFunction(init) ? init : undefined;
  }
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

export function callsReadOnlyFunction(
  call: TSESTree.CallExpression,
  context: { readonly sourceCode: TSESLint.SourceCode; readonly filename: string },
  isRead: IsRead,
  optionsKey: string,
): boolean {
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
