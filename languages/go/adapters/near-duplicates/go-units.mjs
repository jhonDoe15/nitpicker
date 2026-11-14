import path from 'node:path';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { uniqueNames, withSnippet } from '../../../../shared/near-duplicates/unit-parts.mjs';
import { EXPRESSIONS } from './tree/expressions.mjs';
import { at, codeChildren, field, isStatementNode, opaque, typeText } from './tree/nodes.mjs';
import { resolveNames } from './tree/scopes.mjs';
import { parametersOf, resultOf } from './tree/signature.mjs';
import { STATEMENTS } from './tree/statements.mjs';
import { importsOf } from './file-scope.mjs';

const CONVERTERS = { ...STATEMENTS, ...EXPRESSIONS };
const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|`[^`]*`|'(?:\\.|[^'\\])*'|\S/gu;
const UNIT_TYPES = new Set(['function_declaration', 'method_declaration']);

function qualifiedName(text, file) {
  if (file.imports.has(text)) {
    return file.imports.get(text);
  }
  return file.packageNames.has(text) ? `${file.directory}#${text}` : text;
}

function converterContext(root, file) {
  const { resolved, addressed, fresh } = resolveNames(root);
  const converted = new Map();
  const context = {
    get: (source) =>
      converted.get(source.id) ??
      opaque(isStatementNode(source) ? 'statement' : 'expression', source),
    isFresh: (source) => fresh.has(source.id),
    name(source) {
      const value = resolved.get(source.id);
      const common = { ...at('name', source), kind: 'name', text: source.text };
      return value === undefined
        ? { ...common, binding: 'free', value: qualifiedName(source.text, file) }
        : {
            ...common,
            binding: 'bound',
            value,
            ...(addressed.has(value) ? { addressTaken: true } : {}),
          };
    },
    converted,
  };
  return context;
}

function convertedTree(root, file) {
  const context = converterContext(root, file);
  for (const source of [...depthFirst(root, codeChildren)].toReversed()) {
    const convert = CONVERTERS[source.type];
    if (convert !== undefined) {
      context.converted.set(source.id, withSnippet(convert(source, context), source.text));
    }
  }
  return context;
}

function receiverType(source) {
  const receiver = field(source, 'receiver');
  const type = receiver === undefined ? undefined : field(codeChildren(receiver)[0], 'type');
  return type?.text.replace(/^\*/u, '').replace(/\[.*$/u, '').trim();
}

function parameterTypes(source) {
  const list = field(source, 'parameters');
  return codeChildren(list)
    .flatMap((declaration) => {
      const count = Math.max(declaration.childrenForFieldName('name').length, 1);
      const prefix = declaration.type === 'variadic_parameter_declaration' ? '...' : '';
      return Array.from(
        { length: count },
        () => `${prefix}${typeText(field(declaration, 'type'))}`,
      );
    })
    .join(',');
}

function labelOf(source) {
  const own = `${field(source, 'name').text}(${parameterTypes(source)})`;
  const owner = receiverType(source);
  return owner === undefined ? own : `${owner}.${own}`;
}

function resultCount(source) {
  const result = field(source, 'result');
  if (result === undefined) {
    return 0;
  }
  return result.type === 'parameter_list'
    ? codeChildren(result).reduce(
        (total, declaration) =>
          total + Math.max(declaration.childrenForFieldName('name').length, 1),
        0,
      )
    : 1;
}

function isFinal(source) {
  return (
    source.type === 'function_declaration' &&
    field(source, 'type_parameters') === undefined &&
    resultCount(source) <= 1
  );
}

function hasGoto(source) {
  return [...depthFirst(source, codeChildren)].some(({ type }) => type === 'goto_statement');
}

function unitOf(source, file) {
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

export function goUnits(program, file, packageNames) {
  const directory = path.posix.dirname(file);
  const scope = { directory, packageNames, imports: importsOf(program) };
  const units = codeChildren(program)
    .filter((node) => UNIT_TYPES.has(node.type) && field(node, 'body') !== undefined)
    .filter((node) => !(hasGoto(node) || node.hasError))
    .map((node) => unitOf(node, scope));
  return uniqueNames(units).map((unit) => ({ id: `${file}#${unit.name}`, file, ...unit }));
}
