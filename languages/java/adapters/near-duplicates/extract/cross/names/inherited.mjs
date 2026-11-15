import { chainOf } from '../../../../../../../shared/traversal.mjs';
import { importsOf } from '../../creation/exceptions/constructors.mjs';
import { field, squashed } from '../../syntax.mjs';
import { typeWords } from './imports.mjs';

const TYPES = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
]);
const OWNERS = new Set([...TYPES, 'object_creation_expression']);
const INHERITED =
  'a copy uses a type that a supertype of its class declares as a member, which the shared class does not inherit';
const UNKNOWN =
  'a supertype of a copy is not in the project, so it may declare a member type the shared class does not inherit';

function supertypesOf(owner) {
  if (owner.type === 'object_creation_expression') {
    return [field(owner, 'type')];
  }
  const extended = field(owner, 'superclass')?.namedChildren ?? [];
  const implemented = field(owner, 'interfaces')?.namedChildren[0]?.namedChildren ?? [];
  const extending = owner.namedChildren
    .filter(({ type }) => type === 'extends_interfaces')
    .flatMap((node) => node.namedChildren[0]?.namedChildren ?? []);
  return [...extended, ...implemented, ...extending];
}

function nameOf(node) {
  const named = node.type === 'generic_type' ? node.namedChildren[0] : node;
  return squashed(named);
}

function packageName(root) {
  return root.children.find(({ type }) => type === 'package_declaration')?.namedChildren[0]?.text;
}

function candidates(name, { root, pack }) {
  if (name.includes('.')) {
    return [name];
  }
  const imports = importsOf(root).filter(({ isStatic }) => !isStatic);
  const single = imports.find(({ wildcard, last }) => !wildcard && last === name);
  if (single !== undefined) {
    return [single.name];
  }
  const wild = imports.filter(({ wildcard }) => wildcard).map((found) => `${found.name}.${name}`);
  return [pack === undefined ? name : `${pack}.${name}`, ...wild];
}

function resolved(name, context) {
  const simple = name.split('.').at(-1);
  const local = name.includes('.') ? undefined : classIn(context.root, simple);
  if (local !== undefined) {
    return { key: `${context.pack}.${name}`, node: local, root: context.root, release() {} };
  }
  for (const qualified of candidates(name, context)) {
    const source = context.types.open(qualified);
    const node = source === undefined ? undefined : classIn(source.rootNode, simple);
    if (node !== undefined) {
      return { key: qualified, node, root: source.rootNode, release: source.release };
    }
    source?.release();
  }
  return undefined;
}

function classIn(root, name) {
  return root.namedChildren.find(
    (node) => TYPES.has(node.type) && field(node, 'name').text === name,
  );
}

function memberTypes(node) {
  return field(node, 'body')
    .namedChildren.filter(({ type }) => TYPES.has(type))
    .map((member) => field(member, 'name').text);
}

function isObject(name) {
  return name === 'Object' || name === 'java.lang.Object';
}

function recorded(hit, state) {
  state.seen.add(hit.key);
  state.releases.push(hit.release);
  for (const member of memberTypes(hit.node)) {
    state.members.add(member);
  }
  state.work.push({ owner: hit.node, root: hit.root });
}

function expand({ owner, root }, state) {
  for (const type of supertypesOf(owner)) {
    const name = nameOf(type);
    const hit = isObject(name)
      ? undefined
      : resolved(name, { root, pack: packageName(root), types: state.types });
    if (hit === undefined) {
      state.unknown ||= !isObject(name);
    } else if (state.seen.has(hit.key)) {
      hit.release();
    } else {
      recorded(hit, state);
    }
  }
}

function collected(owners, types) {
  const state = {
    types,
    members: new Set(),
    seen: new Set(),
    releases: [],
    unknown: false,
    work: owners.map((owner) => ({ owner, root: owner.tree.rootNode })),
  };
  try {
    for (const item of state.work) {
      expand(item, state);
    }
  } finally {
    for (const release of state.releases) {
      release();
    }
  }
  return state;
}

export function inheritedProblem({ methods, texts, typeSources }) {
  const owners = methods.flatMap((method) =>
    chainOf(method.parent, (node) => node.parent ?? undefined).filter(({ type }) =>
      OWNERS.has(type),
    ),
  );
  const found = collected(owners, typeSources);
  const words = typeWords(texts);
  if ([...words].some((word) => found.members.has(word))) {
    return INHERITED;
  }
  return found.unknown && words.size > 0 ? UNKNOWN : undefined;
}
