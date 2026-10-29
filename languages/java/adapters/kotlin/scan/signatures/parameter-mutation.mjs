import { closingIndex, splitArguments } from '../kotlin-source.mjs';

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
    'Build and return a new collection or array (`items + item`, `items.sorted()`, `items.copyOf()`), or take a read-only `List`, `Set` or `Map` and copy it first (`val copy = items.toMutableList()`): this function changes the argument its caller passed in.',
};

function mutationOf(body, name) {
  const target = String.raw`(?<![\w.])${name}`;
  const forms = [
    String.raw`${target}\s*\??\s*\.\s*(?:${MUTATORS.join('|')})\s*[({<]`,
    String.raw`${target}\s*\[[^\]\n]*\]\s*(?:=(?!=)|[-+*/%]=|\+\+|--)`,
    String.raw`${target}\s*[-+]=`,
    String.raw`(?:${JAVA_MUTATORS})\s*\(\s*${name}\b`,
  ];
  return new RegExp(forms.join('|')).exec(body);
}

function isRebound(body, name) {
  return new RegExp(String.raw`\b(?:val|var)\s+${name}\b|(?<![\w.])${name}\s*->`).test(body);
}

function bodyOf(code, close) {
  const after = /^\s*(?::[^={]*)?(\{|=)/.exec(code.slice(close + 1));
  if (after === null) {
    return undefined;
  }
  const start = close + 1 + after[0].length - 1;
  if (after[1] === '{') {
    return { start, text: code.slice(start, closingIndex(code, start)) };
  }
  const newline = code.indexOf('\n', start);
  return { start, text: code.slice(start, newline === -1 ? undefined : newline) };
}

export function parameterMutations(scanned) {
  const { code } = scanned;
  return [...code.matchAll(FUNCTION)]
    .filter(
      ({ index }) => !/\boverride\b/.test(code.slice(code.lastIndexOf('\n', index) + 1, index)),
    )
    .flatMap((match) => {
      const { close, parts } = splitArguments(code, match.index + match[0].length - 1);
      const body = bodyOf(code, close);
      if (body === undefined) {
        return [];
      }
      return parts.flatMap((part) => {
        const text = code.slice(part.start, part.end);
        const parameter = text.includes('@') ? null : MUTABLE_PARAMETER.exec(text);
        const name = parameter?.[1];
        const found =
          name === undefined || isRebound(body.text, name) ? null : mutationOf(body.text, name);
        return found === null
          ? []
          : [
              {
                rule: 'ParameterMutation',
                offset: body.start + found.index,
                subject: `${match[1]}(${name})`,
              },
            ];
      });
    });
}
