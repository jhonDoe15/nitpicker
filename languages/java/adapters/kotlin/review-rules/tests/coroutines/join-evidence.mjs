import { statementStart } from '../discovery/hosts.mjs';
import { closeOf, escaped, marksFrom } from '../discovery/text-scan.mjs';

const JOINED_AFTER =
  /^\s*\??\.\s*(?:join|await|get|getCompleted|cancelAndJoin|awaitAll|joinAll|asCompletableFuture)\b/u;
const ASSIGNED = /^\s*(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*(?::[^=]+)?\+?=(?!=)/u;
const ADDED = /^\s*([A-Za-z_]\w*)\s*\.\s*(?:add|put|plusAssign|addAll)\s*\(/u;
const JOIN_CALL = /\b(?:joinAll|awaitAll)\s*\(/gu;
const ELEMENT_CALLS = 'first|last|single|elementAt|get|firstOrNull|lastOrNull|getOrNull|random';
const ELEMENT = String.raw`(?:\.\s*(?:${ELEMENT_CALLS})\s*\([^)]*\)|\[[^\]]*\])`;
const ITERATING = [
  'forEach|forEachIndexed|map|mapIndexed|mapNotNull|flatMap|onEach|sumOf|all|any|none|count',
  'filter|fold|first|find|firstOrNull',
].join('|');
const SCOPE_MEMBERS = 'cancel|cancelChildren|coroutineContext|close';
const JOB_MEMBERS =
  'join|await|awaitAll|joinAll|cancelAndJoin|getCompleted|get|cancelChildren|cancel|asCompletableFuture';
const JOIN_WINDOW = 80;
const CALL_TAIL_WINDOW = 40;
const ARGUMENT_WINDOW = 600;
const FOR_ELEMENT = /\bfor\s*\(\s*(\w+)\s+in\s+(\w+)\b/gu;

export function joinedRightAfter(code, from) {
  return JOINED_AFTER.test(code.slice(from, from + JOIN_WINDOW));
}

export function assignedNamesAt(code, index) {
  const text = code.slice(statementStart(code, index), index);
  return [ASSIGNED.exec(text)?.[1], ADDED.exec(text)?.[1]].filter((name) => name !== undefined);
}

function elementNames(bodyText, name) {
  return [...bodyText.matchAll(FOR_ELEMENT)]
    .filter((match) => match[2] === name)
    .map((match) => match[1]);
}

function joinPatterns(word, members) {
  const direct = String.raw`\b${word}\b\s*\??\.\s*(?:${members})\b`;
  const element = String.raw`\b${word}\b\s*${ELEMENT}\s*\??\.\s*(?:${members})\b`;
  const bulk = String.raw`\b(?:joinAll|awaitAll)\b[^\n]*\b${word}\b`;
  const chain = String.raw`[\w.?()\s]{0,60}`;
  const each = String.raw`\b${word}\b${chain}\.\s*(?:${ITERATING})\s*\{[^}]*\b(?:join|await|cancelAndJoin)\b`;
  return [direct, element, bulk, each];
}

function joinedNames(bodyText, names, members) {
  const patterns = names.flatMap((name) => joinPatterns(escaped(name), members));
  return patterns.length > 0 && new RegExp(patterns.join('|'), 'u').test(bodyText);
}

export function isJoined(bodyText, name, { receiver = false } = {}) {
  const names = receiver ? [name] : [name, ...elementNames(bodyText, name)];
  return joinedNames(bodyText, names, receiver ? SCOPE_MEMBERS : JOB_MEMBERS);
}

export function isOwnedByEnclosingCall(scanned, found) {
  const { code } = scanned;
  const { offset, hosts } = found;
  const inLambda = hosts.some(({ open }) =>
    /^\s*\.\s*(?:joinAll|awaitAll)\b/u.test(
      code.slice(closeOf(scanned, open) + 1, closeOf(scanned, open) + CALL_TAIL_WINDOW),
    ),
  );
  const inArguments = [...marksFrom(code, JOIN_CALL, Math.max(0, offset - ARGUMENT_WINDOW))].some(
    (match) => {
      const open = match.index + match[0].length - 1;
      return match.index < offset && open < offset && offset < closeOf(scanned, open);
    },
  );
  return inLambda || inArguments;
}
