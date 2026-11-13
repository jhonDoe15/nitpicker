import { escapeRegExp } from '../../../../../../../shared/paths/glob.mjs';
import { scopesOf } from '../scopes/class-scopes.mjs';

const RULE = 'UnboundedCollectionProperty';
const ANNOTATION_LOOKBEHIND = 200;
const MESSAGES = {
  [RULE]:
    'This property of a singleton bean only ever gains entries, so memory grows for the life of the process. Remove the entry when its request, session or run ends (in `finally` or the destroy function), keep a bounded cache (Caffeine or Guava with a maximum size or expiry), or use a `WeakHashMap` keyed by the object. An exception fits only for a registry filled at startup.',
};
const STEREOTYPE =
  /@(?:Component|Service|Repository|Controller|RestController|Singleton|Configuration)\b/;
const COLLECTION_FACTORIES = [
  'mutable\\w*Of',
  'arrayListOf',
  'hashMapOf',
  'hashSetOf',
  'linkedMapOf',
  'ArrayList',
  'HashMap',
  'HashSet',
  'LinkedList',
  'ConcurrentHashMap',
  'ArrayDeque',
  'LinkedHashMap',
  'LinkedHashSet',
  'ConcurrentLinkedQueue',
  'CopyOnWriteArrayList',
  'Collections\\.synchronized\\w+',
];
const COLLECTION = new RegExp(String.raw`=\s*(?:${COLLECTION_FACTORIES.join('|')})\b`);
const INSPECTING = new RegExp(
  String.raw`(?:^|\.)(?:println|print|info|debug|warn|error|trace|log|format|unmodifiable\w*|` +
    String.raw`containsKey|contains|containsValue|get|getOrDefault|toString|toList|toMap|toSet|` +
    String.raw`count|joinToString|require\w*|check\w*)$`,
);
const STARTUP = /^(?:init|register|setup|configure|load|populate|build)/;
const ADDING =
  '(?:put|add|addAll|putAll|getOrPut|computeIfAbsent|putIfAbsent|merge|offer|push|addFirst|addLast|compute)';
const REMOVING =
  '(?:remove|clear|removeIf|removeAll|retainAll|poll|pop|pollFirst|pollLast|removeFirst|removeLast|evict|invalidate|size|isEmpty)';

function headerBefore(code, offset) {
  const before = code.slice(Math.max(0, offset - ANNOTATION_LOOKBEHIND), offset);
  return before.slice(before.lastIndexOf('\n\n') + 1);
}

function annotated(code, body) {
  return STEREOTYPE.test(headerBefore(code, body.offset));
}

function adderIn(code, scope, name) {
  const target = escapeRegExp(name);
  const adds = new RegExp(
    String.raw`\b${target}\s*(?:\.\s*${ADDING}\s*\(\s*[^"'\d\s)]|\[\s*[^"'\d\s\]][^\]]*\]\s*=[^=]|\s*\+=\s*[^"'\d\s])`,
  );
  return scope.functions.find(
    (fn) =>
      !STARTUP.test(fn.name) &&
      !/@PostConstruct\b/.test(headerBefore(code, fn.offset)) &&
      adds.test(code.slice(fn.open, fn.end)),
  );
}

function removes(text, name) {
  const target = escapeRegExp(name);
  const removing = new RegExp(
    String.raw`\b${target}\s*(?:\??\.\s*${REMOVING}\b|-=|\s*=[^=]|\[[^\]]+\]\s*=\s*null)|\bin\s+${target}\b`,
  );
  return text.split('\n').some((line, index) => {
    const isDeclaration = new RegExp(String.raw`\bva[lr]\s+${target}\b`).test(line);
    const gone = removing.test(line) || handedOver(line, target);
    return index > 0 && !isDeclaration && gone && !isAddCall(line, target);
  });
}

function handedOver(line, name) {
  const target = escapeRegExp(name);
  const calls = line.matchAll(
    new RegExp(String.raw`([\w.]+)\s*\(([^)\n]*\b${target}\b[^)\n]*)\)`, 'g'),
  );
  return [...calls].some((call) => !INSPECTING.test(call[1]));
}

function isAddCall(line, target) {
  return new RegExp(String.raw`\b${target}\s*\.\s*${ADDING}\s*\(`).test(line);
}

export function unboundedCollectionProperty(scanned) {
  const { code } = scanned;
  return scopesOf(code)
    .filter((scope) => annotated(code, scope.body))
    .flatMap((scope) => {
      const text = code.slice(scope.body.open, scope.body.end);
      return scope.properties
        .filter(
          (property) =>
            COLLECTION.test(property.text) &&
            adderIn(code, scope, property.name) !== undefined &&
            !removes(text, property.name),
        )
        .map((property) => ({ rule: RULE, offset: property.offset }));
    });
}

export const kotlinSourceRules = { messages: MESSAGES, main: [unboundedCollectionProperty] };
