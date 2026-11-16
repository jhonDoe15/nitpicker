import type { Node } from 'web-tree-sitter';
import type { ParseText, SourceFile, TypeSources } from '../../../extract-types.mts';
import { chainOf, readRealInside } from '../../../jvm-views.mts';
import { JDK_THROWS, SAFE_JDK } from './jdk-throws.mts';
import { field, namedChildren, parentOf, present, required, squashed } from '../../syntax.mts';

type ConstructorInfo = { readonly size: number; readonly throws: string[] };
type ClassInfo = {
  readonly constructors?: readonly ConstructorInfo[];
  readonly jdk?: string;
};
type Lookup = {
  readonly info?: ClassInfo;
  readonly unsure?: true;
  readonly absent?: true;
};
type LookupContext = {
  readonly root: Node;
  readonly types: TypeSources;
  readonly pack: string | undefined;
};
type ImportInfo = {
  readonly isStatic: boolean;
  readonly name: string;
  readonly wildcard: boolean;
  readonly last: string;
};

const UNSURE: Lookup = { unsure: true };
const ABSENT: Lookup = { absent: true };
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/mu;
const IMPORT = /^import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/u;

export function readerFor(
  root: string,
  sources: readonly SourceFile[],
  parse: ParseText,
): TypeSources {
  const prefixes = sources.flatMap(({ file, text }) => {
    const name = PACKAGE.exec(text)?.[1];
    const tail = `${name?.replaceAll('.', '/') ?? ''}/${present(file.split('/').at(-1))}`;
    return name !== undefined && file.endsWith(tail)
      ? [file.slice(0, file.length - tail.length)]
      : [];
  });
  const planned = new Map(
    sources.map(({ file, text }): [string, string] => [
      `${PACKAGE.exec(text)?.[1] ?? ''}.${present(file.split('/').at(-1)).replace(/\.java$/u, '')}`.replace(
        /^\./u,
        '',
      ),
      text,
    ]),
  );
  return {
    open(qualified: string) {
      const relative = `${qualified.replaceAll('.', '/')}.java`;
      const text =
        planned.get(qualified) ??
        prefixes
          .map((prefix) => readRealInside(root, `${prefix}${relative}`, 'utf8'))
          .find((found) => found !== undefined);
      const tree = text === undefined ? undefined : parse(text);
      return tree
        ? {
            rootNode: tree.rootNode,
            release() {
              tree.delete();
            },
          }
        : undefined;
    },
  };
}

function noTypes(): TypeSources {
  return {
    open() {
      return undefined;
    },
  };
}

function classIn(container: Node, name: string): Node | undefined {
  return container.namedChildren.find(
    (node) => node.type === 'class_declaration' && required(node, 'name').text === name,
  );
}

function sizeOf(declaration: Node): number | undefined {
  const parameters = namedChildren(required(declaration, 'parameters'));
  return parameters.some(({ type }) => type === 'spread_parameter') ? undefined : parameters.length;
}

function throwsOf(declaration: Node): string[] {
  const node = declaration.namedChildren.find(({ type }) => type === 'throws');
  return node === undefined ? [] : namedChildren(node).map(squashed);
}

function constructorsOf(classNode: Node): ConstructorInfo[] | undefined {
  const found = required(classNode, 'body').namedChildren.filter(
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
    size: present(sizes[index]),
    throws: throwsOf(declaration),
  }));
}

export function importsOf(root: Node): ImportInfo[] {
  return root.namedChildren
    .filter(({ type }) => type === 'import_declaration')
    .map(({ text }) => IMPORT.exec(text))
    .filter((found) => found !== null)
    .map(([, isStatic, name, wildcard]) => ({
      isStatic: isStatic !== undefined,
      name: present(name),
      wildcard: wildcard !== undefined,
      last: present(present(name).split('.').at(-1)),
    }));
}

function infoOf(node: Node): Lookup {
  const constructors = constructorsOf(node);
  return constructors === undefined ? UNSURE : { info: { constructors } };
}

function withSource<Value>(
  types: TypeSources,
  qualified: string,
  use: (root: Node) => Value,
): Value | undefined {
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

function fromSource(types: TypeSources, qualified: string): Lookup | undefined {
  const simple = present(qualified.split('.').at(-1));
  return withSource(types, qualified, (root) => {
    const node = classIn(root, simple);
    return node === undefined ? UNSURE : infoOf(node);
  });
}

function typeName(node: Node): string | undefined {
  if (node.type === 'type_identifier') {
    return node.text;
  }
  const [first] = node.namedChildren;
  return node.type === 'generic_type' && first?.type === 'type_identifier' ? first.text : undefined;
}

function ownerTypes(owner: Node): Node[] | undefined {
  if (owner.type === 'object_creation_expression') {
    return [required(owner, 'type')];
  }
  if (owner.type !== 'class_declaration') {
    return undefined;
  }
  const extended = field(owner, 'superclass')?.namedChildren ?? [];
  const implemented = field(owner, 'interfaces')?.namedChildren[0]?.namedChildren ?? [];
  return [...extended, ...implemented];
}

function inheritedIn(node: Node, name: string): Lookup {
  const member = classIn(required(node, 'body'), name);
  if (member !== undefined) {
    return infoOf(member);
  }
  return ownerTypes(node)?.length === 0 ? ABSENT : UNSURE;
}

function inherited(superName: string, name: string, context: LookupContext): Lookup {
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

function enclosing(creation: Node, name: string, context: LookupContext): Lookup | undefined {
  const bodies = chainOf(creation.parent ?? undefined, (node) => node.parent ?? undefined).filter(
    ({ type }) => type === 'class_body',
  );
  for (const body of bodies) {
    const member = classIn(body, name);
    if (member !== undefined) {
      return infoOf(member);
    }
    const supers = ownerTypes(parentOf(body))?.map(typeName);
    const known = supers?.filter((superName) => superName !== undefined);
    if (supers === undefined || known === undefined || known.length !== supers.length) {
      return UNSURE;
    }
    const outcome = known
      .map((superName) => inherited(superName, name, context))
      .find((found) => found !== ABSENT);
    if (outcome !== undefined) {
      return outcome;
    }
  }
  return undefined;
}

function viaImports(name: string, context: LookupContext): Lookup {
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

function classInfo(creation: Node, types: TypeSources): Lookup | undefined {
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

function infoOfCreation(creation: Node, types: TypeSources = noTypes()): ClassInfo | undefined {
  return classInfo(creation, types)?.info;
}

export function isSingleConstructor(creation: Node, types?: TypeSources): boolean {
  const info = infoOfCreation(creation, types);
  if (info?.constructors !== undefined) {
    const size = namedChildren(required(creation, 'arguments')).length;
    return info.constructors.filter((found) => found.size === size).length === 1;
  }
  return info !== undefined && SAFE_JDK.has(info.jdk ?? '');
}

export function thrownBy(creation: Node, types?: TypeSources): string[] | undefined {
  const info = infoOfCreation(creation, types);
  if (info?.constructors !== undefined) {
    const size = namedChildren(required(creation, 'arguments')).length;
    return info.constructors.filter((found) => found.size === size).flatMap(({ throws }) => throws);
  }
  return info === undefined ? undefined : JDK_THROWS.get(info.jdk ?? '');
}
