import type { Node } from 'web-tree-sitter';
import type { Edit, ImportedName, SourceFile } from '../../../extract-types.mts';
import { escapeRegExp } from '../../../jvm-views.mts';
import { descendants, parentOf, present, required } from '../../syntax.mts';

export const IMPORT_NODE = 'import_declaration';
export const IMPORT = /^import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/u;

function importedName(text: string): ImportedName | undefined {
  const [, isStatic, name, wildcard] = IMPORT.exec(text) ?? [];
  if (name === undefined) {
    return undefined;
  }
  return {
    isStatic: isStatic !== undefined,
    wildcard: wildcard !== undefined,
    name,
    last: present(name.split('.').at(-1)),
  };
}

export function importsFor(root: Node, words: ReadonlySet<string>): string[] {
  return root.children
    .filter(({ type }) => type === IMPORT_NODE)
    .filter(({ text }) => {
      const found = importedName(text);
      return found !== undefined && (found.wildcard || words.has(found.last));
    })
    .map(({ text }) => text);
}

export function headerOf(root: Node): string {
  const header: string[] = [];
  for (const child of root.children) {
    if (child.type !== 'block_comment' && child.type !== 'line_comment') {
      break;
    }
    header.push(child.text);
  }
  return header.join('\n');
}

export function packageOf(root: Node): string {
  return root.children.find(({ type }) => type === 'package_declaration')?.text ?? '';
}

export function nestedTypes(root: Node): Set<string> {
  const declarations = new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
  ]);
  return new Set(
    descendants(root)
      .filter(({ type, parent }) => declarations.has(type) && parent?.type !== 'program')
      .map((node) => required(node, 'name').text),
  );
}

const NAMES = new Set(['identifier', 'type_identifier']);
const TAGS = /\{@(?:link|linkplain|value)\s[^}]*\}|@(?:see|throws|exception)\s+\S+/gu;

function isQualified(node: Node): boolean {
  const parent = parentOf(node);
  if (parent.type === 'field_access') {
    return parent.childForFieldName('field')?.id === node.id;
  }
  if (parent.type === 'method_invocation') {
    return (
      parent.childForFieldName('name')?.id === node.id &&
      parent.childForFieldName('object') !== null
    );
  }
  return (
    (parent.type === 'scoped_type_identifier' || parent.type === 'scoped_identifier') &&
    present(parent.lastChild).id === node.id
  );
}

function isInside(node: Node, ranges: readonly { start: number; end: number }[]): boolean {
  return ranges.some(({ start, end }) => node.startIndex >= start && node.endIndex <= end);
}

export const NOISE = /"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;

export function codeOf(text: string): string {
  return present(codeAndTags(text)[0]);
}

function codeAndTags(text: string): string[] {
  const comments = text.match(NOISE) ?? [];
  return [text.replaceAll(NOISE, ' '), ...comments.flatMap((comment) => comment.match(TAGS) ?? [])];
}

function mentions(name: string, texts: readonly string[]): boolean {
  const word = new RegExp(`(?<![.\\w$])${escapeRegExp(name)}(?![\\w$])`, 'u');
  return texts.some((text) => word.test(text));
}

export function unusedImports(
  root: Node,
  edits: readonly Edit[],
): { node: Node; found: ImportedName }[] {
  const nodes = descendants(root);
  const imports = nodes
    .filter(({ type }) => type === IMPORT_NODE)
    .flatMap((node) => {
      const found = importedName(node.text);
      return found !== undefined && !found.wildcard && !found.isStatic ? [{ node, found }] : [];
    });
  const spans = imports.map(({ node: at }) => ({ start: at.startIndex, end: at.endIndex }));
  const code = nodes.filter(
    (node) => NAMES.has(node.type) && !isQualified(node) && !isInside(node, spans),
  );
  const tags = nodes
    .filter(({ type }) => type === 'block_comment' || type === 'line_comment')
    .flatMap((node) => node.text.match(TAGS) ?? []);
  const added = edits.flatMap((edit) => codeAndTags(edit.text));
  return imports.filter(({ found: { last } }) => {
    const uses = code.filter((node) => node.text === last);
    const kept = uses.some((node) => !isInside(node, edits));
    return uses.length > 0 && !kept && !mentions(last, [...added, ...tags]);
  });
}

const WORD = /(?<![\p{L}\p{N}_$.])[A-Z][\p{L}\p{N}_$]*/gu;

function typeMeaning(word: string, root: Node, siblings: ReadonlySet<string>): string {
  const imports = root.children
    .filter(({ type }) => type === IMPORT_NODE)
    .flatMap(({ text }) => {
      const found = importedName(text);
      return found === undefined || found.isStatic ? [] : [found];
    });
  const single = imports.find((found) => !found.wildcard && found.last === word);
  if (single !== undefined) {
    return `import ${single.name}`;
  }
  const own = root.children.some(
    (node) => node.type.endsWith('_declaration') && node.childForFieldName('name')?.text === word,
  );
  if (own || siblings.has(word)) {
    return 'the package';
  }
  const wild = imports.filter((found) => found.wildcard).map((found) => found.name);
  return `on demand ${wild.toSorted().join(',')}`;
}

function staticMeaning(words: ReadonlySet<string>, root: Node): string {
  return root.children
    .filter(({ type }) => type === IMPORT_NODE)
    .map(({ text }) => ({ text, found: importedName(text) }))
    .filter(({ found }) => found?.isStatic && (found.wildcard || words.has(found.last)))
    .map(({ text }) => text)
    .toSorted()
    .join('\n');
}

export function typeWords(texts: readonly string[]): Set<string> {
  return new Set(texts.flatMap((text) => codeOf(text).match(WORD) ?? []));
}

export function meaningProblem({
  sources,
  texts,
  siblings,
}: {
  sources: readonly SourceFile[];
  texts: readonly string[];
  siblings: ReadonlySet<string>;
}): string | undefined {
  const code = typeWords(texts);
  const names = new Set(
    texts.flatMap((text) => codeOf(text).match(/(?<![\w$.])[A-Za-z_$][\w$]*/gu) ?? []),
  );
  const roots = sources.map(({ rootNode }) => rootNode);
  const word = [...code].find(
    (name) => new Set(roots.map((root) => typeMeaning(name, root, siblings))).size > 1,
  );
  if (word !== undefined) {
    return `the name ${word} means a different type in each file`;
  }
  return new Set(roots.map((root) => staticMeaning(names, root))).size > 1
    ? 'the files import different static members the shared code may use'
    : undefined;
}
