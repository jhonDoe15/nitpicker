import { readInside } from '../../../../../../shared/conventions/read-inside.mjs';
import { field, namedChildren, squashed } from '../syntax.mjs';
import { importsOf } from './arg-types.mjs';

const SAFE_JDK = new Set([
  'java.lang.Exception',
  'java.lang.RuntimeException',
  'java.lang.IllegalArgumentException',
  'java.lang.IllegalStateException',
  'java.lang.UnsupportedOperationException',
  'java.lang.Error',
  'java.io.IOException',
]);
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/mu;
const NOISE = /"(?:[^"\\\n]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu;
const OPEN = new Set(['(', '<', '[']);
const CLOSE = new Set([')', '>', ']']);
const TAIL = /^\s*(?:throws[^{;]*)?\{/u;
const TYPE_NODES = new Set(['type_identifier', 'scoped_type_identifier']);

export function readerFor(root, sources) {
  const prefixes = sources.flatMap(({ file, text }) => {
    const name = PACKAGE.exec(text)?.[1];
    const tail = `${name?.replaceAll('.', '/') ?? ''}/${file.split('/').at(-1)}`;
    return name !== undefined && file.endsWith(tail)
      ? [file.slice(0, file.length - tail.length)]
      : [];
  });
  return function readType(qualified) {
    const relative = `${qualified.replaceAll('.', '/')}.java`;
    return prefixes
      .map((prefix) => readInside(root, `${prefix}${relative}`, 'utf8'))
      .find((text) => text !== undefined);
  };
}

function masked(text) {
  return text.replaceAll(NOISE, (match) => match.replaceAll(/[^\n]/gu, ' '));
}

function parameterCount(parameters) {
  if (parameters.trim() === '') {
    return 0;
  }
  const start = { depth: 0, count: 1 };
  return parameters.split('').reduce((state, char) => {
    const depth = state.depth + Number(OPEN.has(char)) - Number(CLOSE.has(char));
    return { depth, count: state.count + Number(char === ',' && depth === 0) };
  }, start).count;
}

function closeOf(code, open) {
  const start = { depth: 0, end: undefined };
  return code
    .slice(open)
    .split('')
    .reduce((state, char, index) => {
      if (state.end !== undefined) {
        return state;
      }
      const depth = state.depth + Number(char === '(') - Number(char === ')');
      return { depth, end: depth === 0 ? open + index : undefined };
    }, start).end;
}

function depthAt(code, from, to) {
  return code
    .slice(from, to)
    .split('')
    .reduce((depth, char) => depth + Number(char === '{') - Number(char === '}'), 0);
}

function constructorParameters(code, name, open) {
  const calls = code.slice(open).matchAll(new RegExp(`(?<![\\w$.])${name}\\s*\\(`, 'gu'));
  return [...calls].flatMap((call) => {
    const at = open + call.index;
    const end = closeOf(code, at + call[0].length - 1);
    const isMember = depthAt(code, open, at) === 1 && !code.slice(0, at).trimEnd().endsWith('new');
    const declares = end !== undefined && TAIL.test(code.slice(end + 1));
    return isMember && declares ? [code.slice(at + call[0].length, end)] : [];
  });
}

function aritiesOf(source, name) {
  const code = masked(source);
  const declared = new RegExp(`\\bclass\\s+${name}\\b`, 'u').exec(code);
  if (declared === null) {
    return undefined;
  }
  const parameters = constructorParameters(code, name, code.indexOf('{', declared.index));
  if (parameters.some((list) => list.includes('...'))) {
    return undefined;
  }
  return parameters.length === 0 ? [0] : parameters.map(parameterCount);
}

function locate(creation, readType) {
  const name = squashed(field(creation, 'type'));
  const simple = name.split('.').at(-1);
  const root = creation.tree.rootNode;
  if (name !== simple) {
    return { simple, known: name, source: readType(name) };
  }
  if (new RegExp(`\\bclass\\s+${simple}\\b`, 'u').test(masked(root.text))) {
    return { simple, source: root.text };
  }
  const imported = importsOf(root).get(simple);
  const pack = PACKAGE.exec(root.text)?.[1];
  const qualified = imported ?? (pack === undefined ? undefined : `${pack}.${simple}`);
  return {
    simple,
    known: imported ?? `java.lang.${simple}`,
    source: qualified === undefined ? undefined : readType(qualified),
  };
}

function noSource() {
  return undefined;
}

export function isSingleConstructor(creation, readType = noSource) {
  const type = field(creation, 'type');
  const anonymous = creation.children.some(({ type: kind }) => kind === 'class_body');
  if (!TYPE_NODES.has(type?.type) || anonymous) {
    return false;
  }
  const where = locate(creation, readType);
  if (where.source === undefined) {
    return SAFE_JDK.has(where.known);
  }
  const size = namedChildren(field(creation, 'arguments')).length;
  return aritiesOf(where.source, where.simple)?.filter((count) => count === size).length === 1;
}
