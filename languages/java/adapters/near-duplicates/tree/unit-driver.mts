import type { Node } from 'web-tree-sitter';
import { depthFirst, uniqueNames, withSnippet } from '../jvm-views.mts';
import type {
  Context,
  Converted,
  FileScope,
  Language,
  Names,
  ShapeNode,
  Unit,
  UnitRoot,
} from '../jvm-types.mts';
import { methodNode, nameNode } from './names.mts';
import { at, codeChildren, opaque, present } from './nodes.mts';

const TOKEN = /[\w$]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S/gu;

function isList(value: Converted): value is readonly ShapeNode[] {
  return Array.isArray(value);
}

function convertedTree<Extra extends object>(
  root: Node,
  names: Names,
  language: Language<Extra>,
): Context<Extra> {
  const converted = new Map<number, Converted>();
  function lookup(source: Node | undefined): Converted {
    const found = present(source);
    return (
      converted.get(found.id) ??
      opaque(language.isStatementNode(found) ? 'statement' : 'expression', found)
    );
  }
  const context: Context<Extra> = {
    ...language.context,
    raw: lookup,
    get: (source) => {
      const found = lookup(source);
      return isList(found) ? at('block', present(source), found) : found;
    },
    name: (text, source) => ({ ...at('name', source), ...nameNode(text, names) }),
    method: (text, source) => ({ ...at('name', source), ...methodNode(text, names) }),
    unstable: (text) => (names.scope.unstable.has(text) ? { unstable: true } : {}),
  };
  for (const source of [...depthFirst(root, codeChildren)].toReversed()) {
    const convert = language.converters[source.type];
    if (convert !== undefined) {
      converted.set(source.id, withSnippet(convert(source, context), source.text));
    }
  }
  return context;
}

function unitRoots<Extra extends object>(
  program: Node,
  scope: FileScope,
  language: Language<Extra>,
): (UnitRoot & { label: string })[] {
  const prefix = scope.packageName === '' ? '' : `${scope.packageName}.`;
  const outer = language.outerScope(program, scope);
  const pending: UnitRoot[] = [{ node: program, qualifier: '', prefix, scope: outer }];
  const roots: (UnitRoot & { label: string })[] = [];
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

function unitOf<Extra extends object>(
  root: UnitRoot & { label: string },
  file: FileScope,
  language: Language<Extra>,
) {
  const names = { bound: language.boundNames(root.node), scope: root.scope, file };
  const tree = language.functionOf(root.node, convertedTree(root.node, names, language));
  const tokens = root.node.text.match(TOKEN)?.length ?? 0;
  const final = language.isFinal(root.node);
  return { name: root.label, start: tree.start, end: tree.end, tokens, final, tree };
}

export function languageUnits<Extra extends object>(
  language: Language<Extra>,
  program: Node,
  file: string,
): Unit[] {
  const scope = language.fileScope(program);
  const units = unitRoots(program, scope, language).map((root) => unitOf(root, scope, language));
  const imports = {
    names: [...new Set(scope.imported.values())],
    stars: scope.stars,
    classes: scope.classes,
  };
  return uniqueNames(units).map((unit) => ({ id: `${file}#${unit.name}`, file, imports, ...unit }));
}
