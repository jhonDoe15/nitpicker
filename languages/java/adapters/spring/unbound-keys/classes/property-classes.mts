import { classesIn } from './class-members.mts';
import { lastArgument, typeParts } from './property-types.mts';
import { closingIndex } from './source-structure.mts';
import { appendAll } from '../../typed/shared-views.mts';
import type {
  Binding,
  ClassDeclaration,
  ClassKeys,
  ClassStep,
  MemberStep,
  PropertyContext,
  SourceText,
  UnboundSource,
} from '../../typed/unbound-types.mts';

type Step = MemberStep | ClassStep;

const BINDING = /@(?:[\w.]*\.)?ConfigurationProperties\b\s*/gu;
const TARGET_CLASS = new RegExp(
  [
    String.raw`^\s*(?:@[\w.]+(?:\s*\((?:[^()]|\([^()]*\))*\))?\s*`,
    String.raw`|(?:public|protected|private|internal|final|abstract|open|static|data|sealed)\s+)*`,
    String.raw`(?:class|record)\s+(\w+)`,
  ].join(''),
  'u',
);
const MAX_DEPTH = 8;
const ANY_TYPES = new Set(['Object', 'Any']);

function kebab(name: string): string {
  return name.replaceAll(/(?<=[a-z\d])([A-Z])/gu, '-$1').toLowerCase();
}

function memberSteps(context: PropertyContext, { key, type, depth }: MemberStep): Step[] {
  const { simple, kind, argument, array, known } = typeParts(type);
  context.exact.add(key);
  if (!known || kind === 'map' || ANY_TYPES.has(simple)) {
    context.open.add(key);
    return [];
  }
  if (array) {
    return [{ key, type: (type ?? '').replace(/\[\s*\]\s*$/u, ''), depth }];
  }
  if (kind === 'collection') {
    return [{ key, type: lastArgument(argument) || undefined, depth }];
  }
  return kind === 'scalar' ? [] : [{ prefix: key, name: simple, depth: depth + 1 }];
}

function classSteps(context: PropertyContext, { prefix, name, depth }: ClassStep): Step[] {
  const bindable = (context.classes.get(name) ?? []).filter(({ kind }) => kind !== 'interface');
  if (bindable.length === 0 || depth > MAX_DEPTH) {
    context.open.add(prefix);
    return [];
  }
  if (bindable.every(({ kind }) => kind === 'enum')) {
    return [];
  }
  context.groups.add(prefix);
  if (bindable.some(({ renamed }) => renamed)) {
    context.open.add(prefix);
  }
  return bindable.flatMap((declaration) => [
    ...declaration.members.map(({ name: member, type }) => ({
      key: `${prefix}.${kebab(member)}`,
      type,
      depth,
    })),
    ...(declaration.superclass === undefined
      ? []
      : [{ prefix, name: declaration.superclass.split('.').at(-1) ?? '', depth: depth + 1 }]),
  ]);
}

function addClass(context: PropertyContext, start: ClassStep): void {
  const pending: Step[] = [start];
  for (const step of pending) {
    appendAll(pending, 'key' in step ? memberSteps(context, step) : classSteps(context, step));
  }
}

function prefixOf(argumentsText: string): string | undefined {
  const named = /\b(?:prefix|value)\s*=\s*"([^"]*)"/u.exec(argumentsText);
  return (named ?? /^\s*"([^"]*)"/u.exec(argumentsText))?.[1];
}

function bindingsIn({ text, code }: SourceText): Binding[] {
  return [...code.matchAll(BINDING)].flatMap((match) => {
    const after = match.index + match[0].length;
    const close = code[after] === '(' ? closingIndex(code, after) : after - 1;
    const prefix = code[after] === '(' ? prefixOf(text.slice(after + 1, close)) : undefined;
    const target = TARGET_CLASS.exec(code.slice(close + 1));
    return prefix === undefined || prefix.trim() === ''
      ? []
      : [{ prefix: prefix.trim(), target: target?.[1] }];
  });
}

function classIndex(sources: readonly UnboundSource[]): Map<string, ClassDeclaration[]> {
  const classes = new Map<string, ClassDeclaration[]>();
  for (const declaration of sources.flatMap(classesIn)) {
    classes.set(declaration.name, [...(classes.get(declaration.name) ?? []), declaration]);
  }
  return classes;
}

export function propertyClassKeys(sources: readonly UnboundSource[]): ClassKeys {
  const context: PropertyContext = {
    classes: classIndex(sources),
    exact: new Set<string>(),
    open: new Set<string>(),
    groups: new Set<string>(),
  };
  for (const { prefix, target } of sources.flatMap(bindingsIn)) {
    if (target === undefined) {
      context.open.add(prefix);
    } else {
      addClass(context, { prefix, name: target, depth: 0 });
    }
  }
  return { owned: [...context.groups], exact: [...context.exact], open: [...context.open] };
}
