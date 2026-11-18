import { closingIndex, splitArguments } from '../kotlin-brackets.mjs';

const RULE = 'NullMapValue';

const NULL_MAP_MESSAGES = {
  [RULE]: [
    'This `java.util.stream.Collectors` map collector throws `NullPointerException` when the value function',
    'of `toMap`, `toUnmodifiableMap` or `toConcurrentMap`, or the classifier of `groupingBy`, returns `null`,',
    'which `Map.Entry::value` over `Any?`, star or nullable values, a `?.` call, `orNull`, `null` and',
    '`Properties` can. Use Kotlin `associate` or `groupBy`, which accept `null`, or filter the nulls first',
    '(`filter { it.value != null }`, `filterValues`) or map them (`Objects.toString`, `?: ""`).',
    'An exception fits only for a value that is never `null` but not typed so.',
  ].join(' '),
};

const COLLECTOR_NAMES = '(toMap|toUnmodifiableMap|toConcurrentMap|groupingBy|groupingByConcurrent)';
const TYPE_ARGUMENTS = String.raw`\s*(?:<[^(){}]*>\s*)?(?=[({])`;
const QUALIFIED_COLLECTOR = new RegExp(
  String.raw`(?<![\w.])(?:java\.util\.stream\.)?Collectors\s*\.\s*${COLLECTOR_NAMES}${TYPE_ARGUMENTS}`,
  'g',
);
const BARE_COLLECTOR = new RegExp(String.raw`(?<![\w.])${COLLECTOR_NAMES}${TYPE_ARGUMENTS}`, 'g');
const STATIC_IMPORT = /^[ \t]*import\s+java\.util\.stream\.Collectors\.(?:\w+|\*)/m;
const VALUE_COLLECTORS = new Set(['toMap', 'toUnmodifiableMap', 'toConcurrentMap']);
const NULLABLE_RESULT = /\bnull\b|\?\.|\w+OrNull\s*\(|\bnullable\b/;
const ELVIS_DEFAULT = /\?:\s*(?!null\b)/;
const NULL_BRANCH = /\belse\s+null\b|\?:\s*null\b|->\s*null\b/;
const ENTRY_REFERENCE = String.raw`Map\s*\.\s*Entry(?:\s*<[^>]*>)?\s*::\s*(?:value|getValue)`;
const ENTRY_LAMBDA = String.raw`\{\s*(?:it|(\w+)\s*->\s*\1)\s*\.\s*value\s*\}`;
const ENTRY_VALUE = new RegExp(`^(?:${ENTRY_REFERENCE}|${ENTRY_LAMBDA})$`);
const ENTRY_SOURCE = /(\w+)\s*\.\s*(?:entries|entrySet\s*\(\s*\))\s*(?:\.|$)/g;
const NULLS_REMOVED =
  /\.\s*(?:filter\s*[({][^;]*?value[^;]*?(?:!=\s*null|nonNull)|filterValues|filterNotNull|mapNotNull)/;
const FILTER_LAMBDA = /\.\s*filter\s*\{([^{}]*)\}/g;
const LAMBDA_PARAMETER = /^\w+\s*->/;
const BRACES = /[{}]/;
const LOOKBACK = 300;

function statementBefore(code, offset) {
  const before = code.slice(Math.max(0, offset - LOOKBACK), offset);
  return before.slice(before.lastIndexOf('\n\n') + 1);
}

function nullableValueMap(code, name) {
  const declared = new RegExp(
    String.raw`\b${name}\s*:\s*(?:Mutable)?Map\s*<\s*[^,<>]+,\s*(?:Any\?|\*|[\w.]+\?)\s*>`,
  );
  const properties = new RegExp(String.raw`\b${name}\b[^\n]*\bProperties\b`);
  return declared.test(code) || properties.test(code);
}

function nullableEntries(code, call) {
  const statement = statementBefore(code, call.index);
  const source = [...statement.matchAll(ENTRY_SOURCE)].at(-1)?.[1];
  return source !== undefined && nullableValueMap(code, source) && !NULLS_REMOVED.test(statement);
}

function testedExpressions(statement) {
  return [...statement.matchAll(FILTER_LAMBDA)]
    .filter((filter) => !filter[1].includes('||'))
    .flatMap((filter) => filter[1].replace(/^\s*\w+\s*->/, '').split('&&'))
    .map((part) => part.trim())
    .flatMap((part) => {
      const check =
        /^(.+)!=\s*null$/.exec(part) ?? /^Objects\s*\.\s*nonNull\s*\((.+)\)$/.exec(part);
      return check === null ? [] : [check[1].replace(/\s+/g, '')];
    });
}

function lambdaBody(text) {
  if (!(text.startsWith('{') && text.endsWith('}'))) {
    return undefined;
  }
  const inner = text.slice(1, -1).trim();
  const body = inner.replace(LAMBDA_PARAMETER, '');
  return BRACES.test(body) ? undefined : body.replace(/\s+/g, '');
}

function filteredBefore(code, call, text) {
  const body = lambdaBody(text);
  if (body === undefined) {
    return false;
  }
  const tested = testedExpressions(statementBefore(code, call.index));
  return tested.includes(body);
}

function resultMayBeNull(code, call, text) {
  if (ELVIS_DEFAULT.test(text)) {
    return NULL_BRANCH.test(text);
  }
  if (filteredBefore(code, call, text)) {
    return false;
  }
  return NULLABLE_RESULT.test(text) || (ENTRY_VALUE.test(text) && nullableEntries(code, call));
}

function valueText(code, call) {
  const open = call.index + call[0].length;
  if (code[open] === '{') {
    return code.slice(open, closingIndex(code, open) + 1);
  }
  const { parts } = splitArguments(code, open);
  const part = parts[VALUE_COLLECTORS.has(call[1]) ? 1 : 0];
  return part === undefined ? undefined : code.slice(part.start, part.end).trim();
}

function collectorCalls(code) {
  const bare = STATIC_IMPORT.test(code) ? [...code.matchAll(BARE_COLLECTOR)] : [];
  return [...code.matchAll(QUALIFIED_COLLECTOR), ...bare];
}

function nullMapValues(scanned) {
  const { code } = scanned;
  return collectorCalls(code)
    .filter((call) => {
      const text = valueText(code, call);
      return text !== undefined && resultMayBeNull(code, call, text);
    })
    .map((call) => ({ rule: RULE, offset: call.index }))
    .toSorted((left, right) => left.offset - right.offset);
}

export const kotlinSourceRules = { messages: NULL_MAP_MESSAGES, main: [nullMapValues] };
