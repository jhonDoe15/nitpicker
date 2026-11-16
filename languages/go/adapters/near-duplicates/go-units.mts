import path from 'node:path';
import type { Node } from 'web-tree-sitter';
import type { Converted, ShapeNode } from '../../../java/adapters/near-duplicates/jvm-types.mts';
import { EXPRESSIONS } from './tree/expressions.mts';
import {
  at,
  codeChildren,
  field,
  isList,
  isStatementNode,
  opaque,
  present,
  required,
  typeText,
} from './tree/nodes.mts';
import { resolveNames } from './tree/scopes.mts';
import type { Resolution } from './tree/scopes.mts';
import { parametersOf, resultOf } from './tree/signature.mts';
import { STATEMENTS } from './tree/statements.mts';
import type {
  FileNames,
  GoContext,
  GoConverters,
  GoNameNode,
  GoUnit,
  UnitParts,
} from './types/go-types.mts';
import {
  depthFirst,
  uniqueNames,
  withSnippet,
} from '../../../java/adapters/near-duplicates/jvm-views.mts';
import { importsOf } from './file-scope.mts';

const NAME = 'name';
const CONVERTERS: GoConverters = { ...STATEMENTS, ...EXPRESSIONS };
const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*'|\S/gu;
const UNIT_TYPES = new Set(['function_declaration', 'method_declaration']);

function qualifiedName(text: string, file: FileNames): string {
  const imported = file.imports.get(text);
  if (imported !== undefined) {
    return imported;
  }
  return file.packageNames.has(text) ? `${file.directory}#${text}` : text;
}

function nameNode(source: Node, names: Resolution, file: FileNames): GoNameNode {
  const value = names.resolved.get(source.id);
  const common = { ...at(NAME, source), kind: NAME, text: source.text };
  return value === undefined
    ? { ...common, binding: 'free', value: qualifiedName(source.text, file) }
    : {
        ...common,
        binding: 'bound',
        value,
        ...(names.addressed.has(value) ? { addressTaken: true as const } : {}),
      };
}

function convertedTree(root: Node, file: FileNames): GoContext {
  const names = resolveNames(root);
  const converted = new Map<number, Converted>();
  function lookup(source: Node | undefined): Converted {
    const found = present(source);
    return (
      converted.get(found.id) ?? opaque(isStatementNode(found) ? 'statement' : 'expression', found)
    );
  }
  const context: GoContext = {
    raw: lookup,
    get: (source) => {
      const found = lookup(source);
      return isList(found) ? at('block', present(source), found) : found;
    },
    isFresh: (source) => names.fresh.has(source.id),
    name: (source) => nameNode(source, names, file),
  };
  for (const source of [...depthFirst(root, codeChildren)].toReversed()) {
    const convert = CONVERTERS[source.type];
    if (convert !== undefined) {
      converted.set(source.id, withSnippet(convert(source, context), source.text));
    }
  }
  return context;
}

function receiverType(source: Node): string | undefined {
  const receiver = field(source, 'receiver');
  const declaration = receiver === undefined ? undefined : codeChildren(receiver)[0];
  const type = declaration === undefined ? undefined : field(declaration, 'type');
  return type?.text.replace(/^\*/u, '').replace(/\[.*$/u, '').trim();
}

function declaredCount(declaration: Node): number {
  return Math.max(declaration.childrenForFieldName(NAME).length, 1);
}

function parameterTypes(source: Node): string {
  return codeChildren(required(source, 'parameters'))
    .flatMap((declaration) => {
      const prefix = declaration.type === 'variadic_parameter_declaration' ? '...' : '';
      return Array.from(
        { length: declaredCount(declaration) },
        () => `${prefix}${typeText(required(declaration, 'type'))}`,
      );
    })
    .join(',');
}

function labelOf(source: Node): string {
  const own = `${required(source, NAME).text}(${parameterTypes(source)})`;
  const owner = receiverType(source);
  return owner === undefined ? own : `${owner}.${own}`;
}

function resultCount(source: Node): number {
  const result = field(source, 'result');
  if (result === undefined) {
    return 0;
  }
  return result.type === 'parameter_list'
    ? codeChildren(result).reduce((total, declaration) => total + declaredCount(declaration), 0)
    : 1;
}

function isFinal(source: Node): boolean {
  return (
    source.type === 'function_declaration' &&
    field(source, 'type_parameters') === undefined &&
    resultCount(source) <= 1
  );
}

function hasGoto(source: Node): boolean {
  return [...depthFirst(source, codeChildren)].some(({ type }) => type === 'goto_statement');
}

function unitOf(source: Node, file: FileNames): UnitParts {
  const context = convertedTree(source, file);
  const tree = at('function', source, [
    resultOf(source),
    parametersOf(source, context),
    context.get(field(source, 'body')),
  ]);
  const tokens = source.text.match(TOKEN)?.length ?? 0;
  return {
    name: labelOf(source),
    start: tree.start,
    end: tree.end,
    tokens,
    final: isFinal(source),
    tree,
  };
}

export function goUnits(program: Node, file: string, packageNames: ReadonlySet<string>): GoUnit[] {
  const directory = path.posix.dirname(file);
  const scope = { directory, packageNames, imports: importsOf(program) };
  const units = codeChildren(program)
    .filter((node) => UNIT_TYPES.has(node.type) && field(node, 'body') !== undefined)
    .filter((node) => !(hasGoto(node) || node.hasError))
    .map((node) => unitOf(node, scope));
  return uniqueNames(units).map((unit) => ({ id: `${file}#${unit.name}`, file, ...unit }));
}
