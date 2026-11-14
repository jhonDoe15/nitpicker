import { descendants } from '../syntax.mjs';

export const IMPORT_NODE = 'import_declaration';
export const IMPORT = /^import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/u;

function importedName(text) {
  const [, isStatic, name, wildcard] = IMPORT.exec(text) ?? [];
  if (name === undefined) {
    return undefined;
  }
  return {
    isStatic: isStatic !== undefined,
    wildcard: wildcard !== undefined,
    name,
    last: name.split('.').at(-1),
  };
}

export function importsFor(root, words) {
  return root.children
    .filter(({ type }) => type === IMPORT_NODE)
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

export const NOISE = /"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;

export function codeOf(text) {
  return codeAndTags(text)[0];
}

function codeAndTags(text) {
  const comments = text.match(NOISE) ?? [];
  return [text.replaceAll(NOISE, ' '), ...comments.flatMap((comment) => comment.match(TAGS) ?? [])];
}

function mentions(name, texts) {
  const word = new RegExp(`(?<![.\\w$])${name.replaceAll('$', '\\$')}(?![\\w$])`, 'u');
  return texts.some((text) => word.test(text));
}

export function unusedImports(root, edits) {
  const nodes = descendants(root);
  const imports = nodes
    .filter(({ type }) => type === IMPORT_NODE)
    .map((node) => ({ node, found: importedName(node.text) }))
    .filter(({ found }) => found !== undefined && !found.wildcard && !found.isStatic);
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

function typeMeaning(word, root, siblings) {
  const imports = root.children
    .filter(({ type }) => type === IMPORT_NODE)
    .map(({ text }) => importedName(text))
    .filter((found) => found !== undefined && !found.isStatic);
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

function staticMeaning(words, root) {
  return root.children
    .filter(({ type }) => type === IMPORT_NODE)
    .map(({ text }) => ({ text, found: importedName(text) }))
    .filter(({ found }) => found?.isStatic && (found.wildcard || words.has(found.last)))
    .map(({ text }) => text)
    .toSorted()
    .join('\n');
}

export function meaningProblem({ sources, texts, siblings }) {
  const code = texts.flatMap((text) => codeAndTags(text)[0].match(WORD) ?? []);
  const lower = new Set(
    texts.flatMap((text) => codeAndTags(text)[0].match(/(?<![\w$.])[a-z_$][\w$]*/gu) ?? []),
  );
  const roots = sources.map(({ rootNode }) => rootNode);
  const word = [...new Set(code)].find(
    (name) => new Set(roots.map((root) => typeMeaning(name, root, siblings))).size > 1,
  );
  if (word !== undefined) {
    return `the name ${word} means a different type in each file`;
  }
  return new Set(roots.map((root) => staticMeaning(lower, root))).size > 1
    ? 'the files import different static members the shared code may use'
    : undefined;
}
