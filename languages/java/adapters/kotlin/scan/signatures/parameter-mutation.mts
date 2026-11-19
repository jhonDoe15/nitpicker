import { escapeRegExp } from '../typed/typed-scan.mts';
import { closingIndex, splitArguments } from '../kotlin-source.mts';
import { enclosingOpens, hasModifier, isMemberLevel } from './declarations.mts';
import type { Range, Scanned, Subjected } from '../typed/scan-shapes.mts';

type Body = { start: number; text: string };

const FUNCTION = /(?<![\w.])fun\s+(?:<[^>]*>\s*)?(?:[\w.<>?]+\.)?([A-Za-z_]\w*)\s*\(/g;
const COLLECTIONS =
  'Mutable(?:List|Set|Map|Collection|Iterable)|ArrayList|LinkedList|HashMap|HashSet|LinkedHashMap|LinkedHashSet|TreeMap|TreeSet|ArrayDeque|PriorityQueue';
const ARRAYS =
  'Array|IntArray|LongArray|DoubleArray|FloatArray|ShortArray|ByteArray|CharArray|BooleanArray';
const MUTABLE_PARAMETER = new RegExp(
  String.raw`^\s*([A-Za-z_]\w*)\s*:\s*(?:${COLLECTIONS}|${ARRAYS})\b`,
);
const MUTATORS = [
  'add',
  'addAll',
  'addFirst',
  'addLast',
  'remove',
  'removeAll',
  'removeAt',
  'removeFirst',
  'removeLast',
  'removeIf',
  'retainAll',
  'clear',
  'put',
  'putAll',
  'putIfAbsent',
  'getOrPut',
  'merge',
  'compute',
  'computeIfAbsent',
  'computeIfPresent',
  'replaceAll',
  'set',
  'sort',
  'sortBy',
  'sortByDescending',
  'sortDescending',
  'sortWith',
  'shuffle',
  'reverse',
  'fill',
  'push',
  'pop',
  'poll',
  'offer',
];
const JAVA_MUTATORS =
  'Collections\\s*\\.\\s*(?:sort|shuffle|reverse|swap|fill|rotate)|Arrays\\s*\\.\\s*(?:sort|fill|setAll)';

const PARAMETER_MUTATION_MESSAGES = {
  ParameterMutation:
    'Build and return a new collection or array (`items + item`, `items.sorted()`, `items.copyOf()`), or take a read-only `List`, `Set` or `Map` and copy it first (`val copy = items.toMutableList()`): this public function changes the argument its caller passed in.',
};

function mutationPattern(name: string, prefix: string): RegExp {
  const target = String.raw`(?<![\w.])${prefix}${name}`;
  const forms = [
    String.raw`${target}\s*\??\s*\.\s*(?:${MUTATORS.join('|')})\s*[({<]`,
    String.raw`${target}\s*\[[^\]\n]*\]\s*(?:!!|\?)?\s*\.\s*(?:${MUTATORS.join('|')})\s*[({<]`,
    String.raw`${target}\s*\[[^\]\n]*\]\s*(?:=(?!=)|[-+*/%]=|\+\+|--)`,
    String.raw`${target}\s*[-+]=`,
    String.raw`(?:${JAVA_MUTATORS})\s*\(\s*${prefix}${name}\b`,
  ];
  return new RegExp(forms.join('|'), 'g');
}

function aliasesOf(body: string, name: string): string[] {
  const pattern = new RegExp(
    String.raw`(?:(?:val|var)\s+)?(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*${escapeRegExp(name)}\s*(?:\n|;|$)`,
    'gm',
  );
  return [...body.matchAll(pattern)]
    .map((match) => match[1] ?? '')
    .filter((alias) => alias !== name);
}

function lambdaScopes(body: string, name: string): Range[] {
  const parameter = new RegExp(String.raw`(?<![\w.])${escapeRegExp(name)}(?!\w)`);
  return [...body.matchAll(/\{([\w\s,:<>?()]*)->/g)]
    .filter((header) => parameter.test(header[1] ?? ''))
    .map((header) => ({ from: header.index, to: closingIndex(body, header.index) }));
}

function localScopes(body: string, name: string): Range[] {
  const enclosing = enclosingOpens(body);
  return [
    ...body.matchAll(new RegExp(String.raw`\b(?:val|var)\s+${escapeRegExp(name)}\b`, 'g')),
  ].map((declaration) => {
    const open = enclosing[declaration.index] ?? -1;
    return { from: declaration.index, to: open === -1 ? body.length : closingIndex(body, open) };
  });
}

function firstMutation(body: string, name: string): RegExpExecArray | undefined {
  const shadows = [...lambdaScopes(body, name), ...localScopes(body, name)];
  const names = [
    { name, prefix: '' },
    ...aliasesOf(body, name).map((alias) => ({
      name: alias,
      prefix: String.raw`(?:this\s*\.\s*)?`,
    })),
  ];
  const hits = names.flatMap(({ name: target, prefix }) =>
    [...body.matchAll(mutationPattern(target, prefix))].filter(
      (hit) => !shadows.some(({ from, to }) => hit.index > from && hit.index < to),
    ),
  );
  return hits.toSorted((left, right) => left.index - right.index).at(0);
}

function indentOf(code: string, index: number): number {
  const start = code.lastIndexOf('\n', index) + 1;
  return (/^[ \t]*/.exec(code.slice(start))?.[0] ?? '').length;
}

function expressionEnd(code: string, start: number, indent: number): number {
  const firstBreak = code.indexOf('\n', start);
  if (firstBreak === -1) {
    return code.length;
  }
  const continuation = new RegExp(String.raw`(?:\n[ \t]{${indent + 1},}\S[^\n]*)*`, 'y');
  continuation.lastIndex = firstBreak;
  return firstBreak + (continuation.exec(code)?.[0] ?? '').length;
}

function bodyOf(code: string, close: number, indent: number): Body | undefined {
  const after = /^\s*(?::[^={]*)?(\{|=)/.exec(code.slice(close + 1));
  if (after === null) {
    return undefined;
  }
  const start = close + 1 + after[0].length - 1;
  const end = after[1] === '{' ? closingIndex(code, start) : expressionEnd(code, start, indent);
  return { start, text: code.slice(start, end) };
}

function isPublicApi(code: string, enclosing: Int32Array, match: RegExpExecArray): boolean {
  return (
    !hasModifier(code, match.index, 'override') &&
    !hasModifier(code, match.index, 'private') &&
    isMemberLevel(code, enclosing, match.index)
  );
}

function mutatedParameters(code: string, match: RegExpExecArray, body: Body): Subjected[] {
  const { parts } = splitArguments(code, match.index + match[0].length - 1);
  return parts.flatMap((part) => {
    const text = code.slice(part.start, part.end);
    const name = text.includes('@') ? undefined : MUTABLE_PARAMETER.exec(text)?.[1];
    const found = name === undefined ? undefined : firstMutation(body.text, name);
    return found === undefined
      ? []
      : [
          {
            rule: 'ParameterMutation',
            offset: body.start + found.index,
            subject: `${match[1] ?? ''}(${name ?? ''})`,
          },
        ];
  });
}

export function parameterMutations(scanned: Scanned): Subjected[] {
  const { code } = scanned;
  const enclosing = enclosingOpens(code);
  return [...code.matchAll(FUNCTION)]
    .filter((match) => isPublicApi(code, enclosing, match))
    .flatMap((match) => {
      const { close } = splitArguments(code, match.index + match[0].length - 1);
      const body = bodyOf(code, close, indentOf(code, match.index));
      return body === undefined ? [] : mutatedParameters(code, match, body);
    });
}

export const kotlinSourceRules = {
  messages: PARAMETER_MUTATION_MESSAGES,
  main: [parameterMutations],
};
