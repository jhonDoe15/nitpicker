import { closingIndex, splitArguments } from '../kotlin-source.mjs';
import { enclosingOpens, hasModifier, isMemberLevel } from './declarations.mjs';

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

export const PARAMETER_MUTATION_MESSAGES = {
  ParameterMutation:
    'Build and return a new collection or array (`items + item`, `items.sorted()`, `items.copyOf()`), or take a read-only `List`, `Set` or `Map` and copy it first (`val copy = items.toMutableList()`): this public function changes the argument its caller passed in.',
};

function mutationPattern(name, prefix) {
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

function aliasesOf(body, name) {
  const pattern = new RegExp(
    String.raw`(?:(?:val|var)\s+)?(?:this\s*\.\s*)?([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*${name}\s*(?:\n|;|$)`,
    'gm',
  );
  return [...body.matchAll(pattern)].map((match) => match[1]).filter((alias) => alias !== name);
}

function lambdaScopes(body, name) {
  const parameter = new RegExp(String.raw`(?<![\w.])${name}(?!\w)`);
  return [...body.matchAll(/\{\s*([\w\s,:<>?()]*?)->/g)]
    .filter((header) => parameter.test(header[1]))
    .map((header) => ({ from: header.index, to: closingIndex(body, header.index) }));
}

function localScopes(body, name) {
  const enclosing = enclosingOpens(body);
  return [...body.matchAll(new RegExp(String.raw`\b(?:val|var)\s+${name}\b`, 'g'))].map(
    (declaration) => {
      const open = enclosing[declaration.index];
      return { from: declaration.index, to: open === -1 ? body.length : closingIndex(body, open) };
    },
  );
}

function firstMutation(body, name) {
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

function indentOf(code, index) {
  const start = code.lastIndexOf('\n', index) + 1;
  return /^[ \t]*/.exec(code.slice(start))[0].length;
}

function continuedLine(line, indent) {
  return line.trim() !== '' && /^[ \t]*/.exec(line)[0].length > indent;
}

function expressionEnd(code, start, indent) {
  let end = code.indexOf('\n', start);
  while (end !== -1) {
    const next = code.indexOf('\n', end + 1);
    const line = code.slice(end + 1, next === -1 ? undefined : next);
    if (!continuedLine(line, indent)) {
      return end;
    }
    end = next;
  }
  return code.length;
}

function bodyOf(code, close, indent) {
  const after = /^\s*(?::[^={]*)?(\{|=)/.exec(code.slice(close + 1));
  if (after === null) {
    return undefined;
  }
  const start = close + 1 + after[0].length - 1;
  const end = after[1] === '{' ? closingIndex(code, start) : expressionEnd(code, start, indent);
  return { start, text: code.slice(start, end) };
}

function isPublicApi(code, enclosing, match) {
  return (
    !hasModifier(code, match.index, 'override') &&
    !hasModifier(code, match.index, 'private') &&
    isMemberLevel(code, enclosing, match.index)
  );
}

function mutatedParameters(code, match, body) {
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
            subject: `${match[1]}(${name})`,
          },
        ];
  });
}

export function parameterMutations(scanned) {
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
