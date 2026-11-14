import { classesIn } from './class-members.mjs';
import { lastArgument, typeParts } from './property-types.mjs';
import { closingIndex } from './source-structure.mjs';

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

function kebab(name) {
  return name.replaceAll(/(?<=[a-z\d])([A-Z])/gu, '-$1').toLowerCase();
}

function memberSteps(context, { key, type, depth }) {
  const { simple, kind, argument, array, known } = typeParts(type);
  context.exact.add(key);
  if (!known || kind === 'map' || ANY_TYPES.has(simple)) {
    context.open.add(key);
    return [];
  }
  if (array) {
    return [{ key, type: type.replace(/\[\s*\]\s*$/u, ''), depth }];
  }
  if (kind === 'collection') {
    return [{ key, type: lastArgument(argument) || undefined, depth }];
  }
  return kind === 'scalar' ? [] : [{ prefix: key, name: simple, depth: depth + 1 }];
}

function classSteps(context, { prefix, name, depth }) {
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
      : [{ prefix, name: declaration.superclass.split('.').at(-1), depth: depth + 1 }]),
  ]);
}

function addClass(context, start) {
  const pending = [start];
  for (const step of pending) {
    pending.push(
      ...(step.key === undefined ? classSteps(context, step) : memberSteps(context, step)),
    );
  }
}

function prefixOf(argumentsText) {
  const named = /\b(?:prefix|value)\s*=\s*"([^"]*)"/u.exec(argumentsText);
  return (named ?? /^\s*"([^"]*)"/u.exec(argumentsText))?.[1];
}

function bindingsIn({ text, code }) {
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

function classIndex(sources) {
  const classes = new Map();
  for (const declaration of sources.flatMap(classesIn)) {
    classes.set(declaration.name, [...(classes.get(declaration.name) ?? []), declaration]);
  }
  return classes;
}

export function propertyClassKeys(sources) {
  const context = {
    classes: classIndex(sources),
    exact: new Set(),
    open: new Set(),
    groups: new Set(),
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
