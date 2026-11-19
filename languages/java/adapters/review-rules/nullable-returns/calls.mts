import { splitTopLevel } from '../max-value-sums/source-file.mts';
import { eligible, newBefore } from './returns.mts';
import type { Declared, ClassInfo, MethodInfo, Nullable } from './declarations.mts';
import type { Frame, SourceFile } from '../max-value-sums/sum-types.mts';

export type ProjectClass = ClassInfo & {
  readonly file: string;
  readonly source: SourceFile;
  readonly nullable: ReadonlyMap<MethodInfo, Nullable>;
};

export type Target = {
  readonly owner: string;
  readonly file: string;
  readonly key: string;
  readonly method: MethodInfo;
  readonly nullable: Nullable | undefined;
};

export type FileModel = {
  readonly source: SourceFile;
  readonly pkg: string;
  readonly imports: readonly string[];
  readonly statics: ReadonlyMap<string, string>;
  readonly classes: readonly ProjectClass[];
};

export type Lookup = ReadonlyMap<string, readonly ProjectClass[]>;
export type Site = {
  readonly name: number;
  readonly start: number;
  readonly close: number;
  readonly target: Target;
};
export type Scope = {
  readonly model: FileModel;
  readonly frame: Frame;
  readonly lookup: Lookup;
  readonly declared: Declared[];
};

const NOT_CALLS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'try',
  'return',
  'new',
  'throw',
  'assert',
  'super',
  'this',
]);
function targetIn(cls: ProjectClass, name: string, count: number): Target | 'absent' | undefined {
  const named = cls.methods.filter((method) => method.name === name);
  const group = named.filter((method) => method.arity === count);
  const found = group.map((method) => cls.nullable.get(method));
  const first = group[0];
  const mixed =
    found.some((each) => each === undefined) && found.some((each) => each !== undefined);
  if (named.length === 0) {
    return 'absent';
  }
  if (first === undefined || mixed || !group.every(eligible) || named.some((m) => m.varargs)) {
    return undefined;
  }
  const key = `${cls.qualified}#${name}/${String(count)}`;
  return { owner: cls.name, file: cls.file, key, method: first, nullable: found[0] };
}

function enclosingClasses(scope: Scope, index: number): ProjectClass[] | undefined {
  const { source } = scope.model;
  const found: ProjectClass[] = [];
  for (let open = source.opener[index] ?? -1; open >= 0; open = source.opener[open] ?? -1) {
    const anonymous =
      source.tokens[open - 1]?.text === ')' &&
      newBefore(source.tokens, source.partner[open - 1] ?? 0);
    const named = scope.model.classes.find((cls) => cls.open === open);
    if (anonymous) {
      return undefined;
    }
    if (named !== undefined) {
      found.push(named);
    }
  }
  return found;
}

function visible(model: FileModel, cls: ProjectClass): boolean {
  const explicit = model.imports.filter((name) => name.endsWith(`.${cls.name}`));
  const outer = cls.qualified.slice(0, cls.qualified.lastIndexOf('.'));
  if (explicit.length > 0) {
    return explicit.includes(cls.qualified);
  }
  return (
    cls.file === model.source.file ||
    (!cls.nested && outer === model.pkg) ||
    model.imports.includes(`${outer}.*`)
  );
}

function uniqueClass(scope: Scope, name: string | undefined): ProjectClass | undefined {
  const named = (scope.lookup.get(name ?? '') ?? []).filter((cls) => visible(scope.model, cls));
  return named.length === 1 ? named[0] : undefined;
}

function receiverType(
  scope: Scope,
  { name, at, classes }: { name: string; at: number; classes: ProjectClass[] },
): string | undefined {
  const local = scope.declared.findLast((each) => each.name === name && each.index < at);
  if (local !== undefined) {
    return local.type;
  }
  const field = classes.map((cls) => cls.fields.get(name)).find((type) => type !== undefined);
  return field ?? (uniqueClass(scope, name) === undefined ? undefined : name);
}

function importedOwner(scope: Scope, name: string): ProjectClass | undefined {
  const owner = scope.model.statics.get(name);
  const simple = owner?.slice(owner.lastIndexOf('.') + 1);
  const named = (scope.lookup.get(simple ?? '') ?? []).filter((cls) => cls.qualified === owner);
  return named.length === 1 ? named[0] : undefined;
}

export type Resolved = {
  readonly cls: ProjectClass;
  readonly name: number;
  readonly start: number;
  readonly close: number;
  readonly count: number;
};

type Callable = {
  readonly close: number;
  readonly count: number;
  readonly classes: ProjectClass[];
};

function callableAt(scope: Scope, index: number): Callable | undefined {
  const { tokens, partner } = scope.model.source;
  const close = partner[index + 1] ?? -1;
  const before = tokens[index - 1]?.text;
  const classes = enclosingClasses(scope, index);
  const callable =
    tokens[index]?.kind === 'identifier' &&
    !NOT_CALLS.has(tokens[index]?.text ?? '') &&
    tokens[index + 1]?.text === '(' &&
    close >= 0 &&
    before !== 'new' &&
    before !== '::';
  if (!callable || classes === undefined) {
    return undefined;
  }
  const count = splitTopLevel(scope.model.source, { from: index + 2, to: close }).length;
  return { close, count, classes };
}

function ownCall(scope: Scope, index: number, call: Callable): Resolved | undefined {
  const { tokens } = scope.model.source;
  const text = tokens[index]?.text ?? '';
  const dotted = tokens[index - 1]?.text === '.';
  const at = call.classes.findIndex((each) => each.methods.some((method) => method.name === text));
  const imported = at < 0 && !dotted ? importedOwner(scope, text) : undefined;
  const cls = at < 0 ? imported : call.classes[at];
  const shadowed = call.classes.slice(0, Math.max(at, 0)).some((each) => each.derived);
  const { close, count } = call;
  const start = dotted ? index - 2 : index;
  return cls === undefined || shadowed ? undefined : { cls, name: index, start, close, count };
}

function receiverCall(scope: Scope, index: number, call: Callable): Resolved | undefined {
  const { tokens } = scope.model.source;
  const receiver = tokens[index - 2];
  const field = tokens[index - 3]?.text === '.' && tokens[index - 4]?.text === 'this';
  if (receiver?.kind !== 'identifier' || (tokens[index - 3]?.text === '.' && !field)) {
    return undefined;
  }
  const type = receiverType(scope, { name: receiver.text, at: index, classes: call.classes });
  const cls = uniqueClass(scope, type);
  const { close, count } = call;
  const start = field ? index - 4 : index - 2;
  return cls === undefined ? undefined : { cls, name: index, start, close, count };
}

export function resolveAt(scope: Scope, index: number): Resolved | undefined {
  const { tokens } = scope.model.source;
  const call = callableAt(scope, index);
  const receiver = tokens[index - 2];
  const own =
    tokens[index - 1]?.text !== '.' ||
    (receiver?.text === 'this' && tokens[index - 3]?.text !== '.');
  if (call === undefined) {
    return undefined;
  }
  return own ? ownCall(scope, index, call) : receiverCall(scope, index, call);
}

export function siteAt(scope: Scope, index: number): Site | undefined {
  const resolved = resolveAt(scope, index);
  const target =
    resolved === undefined
      ? undefined
      : targetIn(resolved.cls, scope.model.source.tokens[index]?.text ?? '', resolved.count);
  return resolved === undefined || typeof target !== 'object'
    ? undefined
    : { name: index, start: resolved.start, close: resolved.close, target };
}

const COPYING_TYPES = new Set([
  'ArrayList',
  'LinkedList',
  'HashSet',
  'LinkedHashSet',
  'TreeSet',
  'HashMap',
  'LinkedHashMap',
  'TreeMap',
  'ArrayDeque',
  'PriorityQueue',
  'String',
]);
const COPYING_CALLS =
  /^(?:unmodifiable\w+|synchronized\w+|copyOf|addAll|putAll|unmodifiableCollection)$/u;
export function copyingCall(source: SourceFile, at: number): string | undefined {
  const { tokens, opener } = source;
  const open = opener[at] ?? -1;
  const direct = tokens[at - 1]?.text === '(' && tokens[at + 1]?.text === ')';
  let name = open - 1;
  if (tokens[name]?.text === '>') {
    while (name >= 0 && tokens[name]?.text !== '<') {
      name -= 1;
    }
    name -= 1;
  }
  const callee = tokens[name]?.text ?? '';
  const constructs = tokens[name - 1]?.text === 'new';
  const copies = constructs ? COPYING_TYPES.has(callee) : COPYING_CALLS.test(callee);
  return direct && copies && tokens[open]?.text === '('
    ? `${constructs ? 'new ' : ''}${callee}`
    : undefined;
}
