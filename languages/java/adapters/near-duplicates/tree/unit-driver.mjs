import { depthFirst } from '../../../../../shared/traversal.mjs';
import { uniqueNames, withSnippet } from '../../../../../shared/near-duplicates/unit-parts.mjs';
import { methodNode, nameNode } from './names.mjs';
import { at, codeChildren, opaque } from './nodes.mjs';

const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S/gu;

function convertedTree(root, names, language) {
  const converted = new Map();
  const context = {
    ...language.context,
    get: (source) =>
      converted.get(source.id) ??
      opaque(language.isStatementNode(source) ? 'statement' : 'expression', source),
    name: (text, source) => ({ ...at('name', source), ...nameNode(text, names) }),
    method: (text, source) => ({ ...at('name', source), ...methodNode(text, names) }),
  };
  for (const source of [...depthFirst(root, codeChildren)].toReversed()) {
    const convert = language.converters[source.type];
    if (convert !== undefined) {
      converted.set(source.id, withSnippet(convert(source, context), source.text));
    }
  }
  return context;
}

function unitRoots(program, scope, language) {
  const prefix = scope.packageName === '' ? '' : `${scope.packageName}.`;
  const outer = language.outerScope(program, scope);
  const pending = [{ node: program, qualifier: '', prefix, scope: outer }];
  const roots = [];
  for (const entry of pending) {
    if (entry.node !== program && language.isUnit(entry.node)) {
      roots.push({ ...entry, label: language.unitLabel(entry.node, entry.qualifier) });
    } else {
      const inner = language.scopeOf(entry.node, entry);
      pending.push(...codeChildren(entry.node).map((node) => ({ ...inner, node })));
    }
  }
  return roots.toSorted((left, right) => left.node.startIndex - right.node.startIndex);
}

function unitOf(root, file, language) {
  const names = { bound: language.boundNames(root.node), scope: root.scope, file };
  const tree = language.functionOf(root.node, convertedTree(root.node, names, language));
  const tokens = root.node.text.match(TOKEN)?.length ?? 0;
  return { name: root.label, start: tree.start, end: tree.end, tokens, tree };
}

export function languageUnits(language, program, file) {
  const scope = language.fileScope(program);
  const units = unitRoots(program, scope, language).map((root) => unitOf(root, scope, language));
  return uniqueNames(units).map((unit) => ({ id: `${file}#${unit.name}`, file, ...unit }));
}
