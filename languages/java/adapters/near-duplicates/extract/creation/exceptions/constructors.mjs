import { chainOf } from '../../../../../../../shared/traversal.mjs';
import { readRealInside } from '../../../../../../../shared/conventions/read-inside.mjs';
import { field, namedChildren, squashed } from '../../syntax.mjs';

const SAFE_JDK = new Set([
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException',
  'java.lang.UnsupportedOperationException',
  'java.lang.Error',
  'java.io.IOException',
]);
const JDK_THROWS = new Map([
  ['java.net.URL', ['MalformedURLException']],
  ['java.net.URI', ['URISyntaxException']],
  ['java.io.FileInputStream', ['FileNotFoundException']],
  ['java.io.FileOutputStream', ['FileNotFoundException']],
  ['java.lang.StringBuilder', []],
  ['java.lang.StringBuffer', []],
  ['java.util.ArrayList', []],
  ['java.util.LinkedList', []],
  ['java.util.HashSet', []],
  ['java.util.TreeSet', []],
  ['java.util.HashMap', []],
]);
const UNSURE = { unsure: true };
const ABSENT = { absent: true };
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/mu;
const IMPORT = /^import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/u;

export function readerFor(root, sources, parse) {
  const prefixes = sources.flatMap(({ file, text }) => {
    const name = PACKAGE.exec(text)?.[1];
    const tail = `${name?.replaceAll('.', '/') ?? ''}/${file.split('/').at(-1)}`;
    return name !== undefined && file.endsWith(tail)
      ? [file.slice(0, file.length - tail.length)]
      : [];
  });
  return {
    open(qualified) {
      const relative = `${qualified.replaceAll('.', '/')}.java`;
      const text = prefixes
        .map((prefix) => readRealInside(root, `${prefix}${relative}`, 'utf8'))
        .find((found) => found !== undefined);
      const tree = text === undefined ? undefined : parse(text);
      return tree ? { rootNode: tree.rootNode, release: () => tree.delete() } : undefined;
    },
  };
}

function noTypes() {
  return {
    open() {
      return undefined;
    },
  };
}

function classIn(container, name) {
  return container.namedChildren.find(
    (node) => node.type === 'class_declaration' && field(node, 'name').text === name,
  );
}

function sizeOf(declaration) {
  const parameters = namedChildren(field(declaration, 'parameters'));
  return parameters.some(({ type }) => type === 'spread_parameter') ? undefined : parameters.length;
}

function throwsOf(declaration) {
  const node = declaration.namedChildren.find(({ type }) => type === 'throws');
  return node === undefined ? [] : namedChildren(node).map(squashed);
}

function constructorsOf(classNode) {
  const found = field(classNode, 'body').namedChildren.filter(
    ({ type }) => type === 'constructor_declaration',
  );
  if (found.length === 0) {
    return [{ size: 0, throws: [] }];
  }
  const sizes = found.map(sizeOf);
  if (sizes.includes(undefined)) {
    return undefined;
  }
  return found.map((declaration, index) => ({
    size: sizes[index],
    throws: throwsOf(declaration),
  }));
}

function importsOf(root) {
  return root.namedChildren
    .filter(({ type }) => type === 'import_declaration')
    .map(({ text }) => IMPORT.exec(text))
    .filter((found) => found !== null)
    .map(([, isStatic, name, wildcard]) => ({
      isStatic: isStatic !== undefined,
      name,
      wildcard: wildcard !== undefined,
      last: name.split('.').at(-1),
    }));
}

function infoOf(node) {
  const constructors = constructorsOf(node);
  return constructors === undefined ? UNSURE : { info: { constructors } };
}

function withSource(types, qualified, use) {
  const source = types.open(qualified);
  if (source === undefined) {
    return undefined;
  }
  try {
    return use(source.rootNode);
  } finally {
    source.release();
  }
}

function fromSource(types, qualified) {
  const simple = qualified.split('.').at(-1);
  return withSource(types, qualified, (root) => {
    const node = classIn(root, simple);
    return node === undefined ? UNSURE : infoOf(node);
  });
}

function typeName(node) {
  if (node.type === 'type_identifier') {
    return node.text;
  }
  return node.type === 'generic_type' && node.namedChildren[0].type === 'type_identifier'
    ? node.namedChildren[0].text
    : undefined;
}

function ownerTypes(owner) {
  if (owner.type === 'object_creation_expression') {
    return [field(owner, 'type')];
  }
  if (owner.type !== 'class_declaration') {
    return undefined;
  }
  const extended = field(owner, 'superclass')?.namedChildren ?? [];
  const implemented = field(owner, 'interfaces')?.namedChildren[0]?.namedChildren ?? [];
  return [...extended, ...implemented];
}

function inheritedIn(node, name) {
  const member = classIn(field(node, 'body'), name);
  if (member !== undefined) {
    return infoOf(member);
  }
  return ownerTypes(node)?.length === 0 ? ABSENT : UNSURE;
}

function inherited(superName, name, context) {
  const { root, types, pack } = context;
  const local = classIn(root, superName);
  if (local !== undefined) {
    return inheritedIn(local, name);
  }
  const single = importsOf(root).find((found) => !found.isStatic && found.last === superName);
  const qualified = single?.name ?? (pack === undefined ? undefined : `${pack}.${superName}`);
  const found =
    qualified === undefined
      ? undefined
      : withSource(types, qualified, (other) => {
          const node = classIn(other, superName);
          return node === undefined ? UNSURE : inheritedIn(node, name);
        });
  return found ?? UNSURE;
}

function enclosing(creation, name, context) {
  const bodies = chainOf(creation.parent, (node) => node.parent ?? undefined).filter(
    ({ type }) => type === 'class_body',
  );
  for (const body of bodies) {
    const member = classIn(body, name);
    if (member !== undefined) {
      return infoOf(member);
    }
    const supers = ownerTypes(body.parent)?.map(typeName);
    if (supers === undefined || supers.includes(undefined)) {
      return UNSURE;
    }
    const outcome = supers
      .map((superName) => inherited(superName, name, context))
      .find((found) => found !== ABSENT);
    if (outcome !== undefined) {
      return outcome;
    }
  }
  return undefined;
}

function viaImports(name, context) {
  const imports = importsOf(context.root);
  const single = imports.find((found) => found.last === name && !found.wildcard);
  if (single?.isStatic) {
    return UNSURE;
  }
  if (single !== undefined) {
    return fromSource(context.types, single.name) ?? { info: { jdk: single.name } };
  }
  const pack =
    context.pack === undefined ? undefined : fromSource(context.types, `${context.pack}.${name}`);
  if (pack !== undefined) {
    return pack;
  }
  return imports.some(({ wildcard }) => wildcard) ? UNSURE : { info: { jdk: `java.lang.${name}` } };
}

function classInfo(creation, types) {
  const type = field(creation, 'type');
  const anonymous = creation.children.some(({ type: kind }) => kind === 'class_body');
  if (anonymous || type === undefined) {
    return undefined;
  }
  if (type.type === 'scoped_type_identifier') {
    const text = squashed(type);
    return /^[a-z]/u.test(text) ? (fromSource(types, text) ?? { info: { jdk: text } }) : UNSURE;
  }
  if (type.type !== 'type_identifier') {
    return undefined;
  }
  const root = creation.tree.rootNode;
  const context = { root, types, pack: PACKAGE.exec(root.text)?.[1] };
  const local = classIn(root, type.text);
  return (
    enclosing(creation, type.text, context) ??
    (local === undefined ? viaImports(type.text, context) : infoOf(local))
  );
}

function infoOfCreation(creation, types = noTypes()) {
  return classInfo(creation, types)?.info;
}

export function isSingleConstructor(creation, types) {
  const info = infoOfCreation(creation, types);
  if (info?.constructors !== undefined) {
    const size = namedChildren(field(creation, 'arguments')).length;
    return info.constructors.filter((found) => found.size === size).length === 1;
  }
  return info !== undefined && SAFE_JDK.has(info.jdk);
}

export function thrownBy(creation, types) {
  const info = infoOfCreation(creation, types);
  if (info?.constructors !== undefined) {
    const size = namedChildren(field(creation, 'arguments')).length;
    return info.constructors.filter((found) => found.size === size).flatMap(({ throws }) => throws);
  }
  return info === undefined ? undefined : JDK_THROWS.get(info.jdk);
}
