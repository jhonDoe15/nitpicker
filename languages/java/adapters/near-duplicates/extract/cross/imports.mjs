import { descendants } from '../syntax.mjs';

const IMPORT = /^import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/u;

function importedName(text) {
  const [, isStatic, name, wildcard] = IMPORT.exec(text) ?? [];
  if (name === undefined) {
    return undefined;
  }
  return {
    isStatic: isStatic !== undefined,
    wildcard: wildcard !== undefined,
    last: name.split('.').at(-1),
  };
}

export function importsFor(root, words) {
  return root.children
    .filter(({ type }) => type === 'import_declaration')
    .filter(({ text }) => {
      const found = importedName(text);
      return found !== undefined && (found.wildcard || words.has(found.last));
    })
    .map(({ text }) => text);
}

export function headerOf(root) {
  const header = [];
  for (const child of root.children) {
    if (child.type !== 'block_comment' && child.type !== 'line_comment') {
      break;
    }
    header.push(child.text);
  }
  return header.join('\n');
}

export function packageOf(root) {
  return root.children.find(({ type }) => type === 'package_declaration')?.text ?? '';
}

export function nestedTypes(root) {
  const declarations = new Set([
    'class_declaration',
    'interface_declaration',
    'enum_declaration',
    'record_declaration',
  ]);
  return new Set(
    descendants(root)
      .filter(({ type, parent }) => declarations.has(type) && parent.type !== 'program')
      .map((node) => node.childForFieldName('name').text),
  );
}

const NAMES = new Set(['identifier', 'type_identifier']);
const TAGS = /\{@(?:link|linkplain|value)\s[^}]*\}|@(?:see|throws|exception)\s+\S+/gu;

function isQualified(node) {
  const { parent } = node;
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
    parent.lastChild.id === node.id
  );
}

function isInside(node, ranges) {
  return ranges.some(({ start, end }) => node.startIndex >= start && node.endIndex <= end);
}

const NOISE = /"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;

function codeAndTags(text) {
  const comments = text.match(NOISE) ?? [];
  return [text.replaceAll(NOISE, ' '), ...comments.flatMap((comment) => comment.match(TAGS) ?? [])];
}

function mentions(name, texts) {
  const word = new RegExp(`(?<![.\\w$])${name.replaceAll('$', '\\$')}(?![\\w$])`, 'u');
  return texts.some((text) => word.test(text));
}

export function droppedImports(root, text, edits) {
  const nodes = descendants(root);
  const imports = nodes
    .filter(({ type }) => type === 'import_declaration')
    .map((node) => ({ node, found: importedName(node.text) }))
    .filter(({ found }) => found !== undefined && !found.wildcard);
  const code = nodes.filter(
    (node) =>
      NAMES.has(node.type) &&
      !isQualified(node) &&
      !isInside(
        node,
        imports.map(({ node: at }) => ({ start: at.startIndex, end: at.endIndex })),
      ),
  );
  const tags = nodes
    .filter(({ type }) => type === 'block_comment' || type === 'line_comment')
    .flatMap((node) => node.text.match(TAGS) ?? []);
  const added = edits.flatMap((edit) => codeAndTags(edit.text));
  return imports
    .filter(({ found: { last } }) => {
      const uses = code.filter((node) => node.text === last);
      const kept = uses.some((node) => !isInside(node, edits));
      return uses.length > 0 && !kept && !mentions(last, [...added, ...tags]);
    })
    .map(({ node }) => ({
      start: node.startIndex,
      end: text[node.endIndex] === '\n' ? node.endIndex + 1 : node.endIndex,
      text: '',
    }));
}
