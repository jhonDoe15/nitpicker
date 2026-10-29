import { annotationIn } from '../spring-names.mjs';
import { acceptsArguments, isSelfCall, ownerOf } from '../spring-scopes.mjs';
import { VALUE } from '../spring-types.mjs';

const REGIONS = new Set(['fun', 'init', 'class', 'object']);
const TEXT_TYPES = /^(?:(?:kotlin\.)?(?:String|CharSequence)|(?:java\.net\.)?(?:URI|URL))\??$/u;
const VALUE_TYPES = /^(?:Int|Long|Short|Byte|Double|Float|Boolean|Char|Unit|Number)\??$/u;
const NAME_START = /[\p{L}_]/u;
const WORD = /[\p{L}\p{N}_]+/uy;
const DIGIT = /\d/u;
const MEMBER_AFTER = /^\s*\??\./u;
const NAMED_ARGUMENT = /^\s*=(?!=)/u;
const SELECTED_BEFORE = /(?:\.|\?\.|::)\s*$/u;
const TEMPLATE_VARIABLES = new Set([
  'buildAndExpand',
  'expand',
  'path',
  'pathSegment',
  'queryParam',
  'queryParams',
  'replaceQueryParam',
  'uriVariables',
]);
const HELPER_DEPTH = 3;
const DIRECT = 'direct';
const MEMBER = 'member';

function wordAt(text, start) {
  WORD.lastIndex = start;
  return WORD.exec(text)?.[0] ?? '';
}

function closing(text, start, [open, close]) {
  let depth = 1;
  let index = start;
  while (index < text.length && depth > 0) {
    depth += { [open]: 1, [close]: -1 }[text[index]] ?? 0;
    index += 1;
  }
  return index;
}

function stringEnd(text, start, found) {
  const raw = text.startsWith('"""', start);
  const quote = raw ? '"""' : '"';
  let index = start + quote.length;
  while (index < text.length && !text.startsWith(quote, index)) {
    if (!raw && text[index] === '\\') {
      index += 2;
    } else if (text[index] === '$' && text[index + 1] === '{') {
      const end = closing(text, index + 2, '{}');
      found.push(...referencesIn(text.slice(index + 2, end - 1)));
      index = end;
    } else if (text[index] === '$' && NAME_START.test(text[index + 1] ?? '')) {
      const name = wordAt(text, index + 1);
      found.push({ name, member: false });
      index += name.length + 1;
    } else {
      index += 1;
    }
  }
  return index + quote.length;
}

function nameEnd(text, index, found) {
  const word = wordAt(text, index);
  const after = text.slice(index + word.length);
  const selected = SELECTED_BEFORE.test(text.slice(0, index));
  if (selected && TEMPLATE_VARIABLES.has(word) && after.startsWith('(')) {
    return closing(text, index + word.length + 1, '()');
  }
  if (!DIGIT.test(text[index]) && !selected && !NAMED_ARGUMENT.test(after)) {
    found.push({ name: word, member: MEMBER_AFTER.test(after) });
  }
  return index + word.length;
}

export function referencesIn(text) {
  const found = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      index = stringEnd(text, index, found);
    } else if (char === "'") {
      index = text.indexOf("'", index + (text[index + 1] === '\\' ? 3 : 2)) + 1 || text.length;
    } else if (NAME_START.test(char) || DIGIT.test(char)) {
      index = nameEnd(text, index, found);
    } else {
      index += 1;
    }
  }
  return found;
}

export function readsTainted(text, taint) {
  return referencesIn(text ?? '').some(
    ({ name, member }) => taint.get(name) === DIRECT || (member && taint.get(name) === MEMBER),
  );
}

export function regionOf(view, scopeId) {
  return view.chain(scopeId).find(({ k }) => REGIONS.has(k));
}

function classOf(view, region) {
  return view.classes.get(view.chain(region.id).find(({ k }) => k === 'class')?.qualified);
}

export function parametersOf(view, region) {
  if (region?.k === 'fun') {
    return view.functionOf(region)?.parameters ?? [];
  }
  return region?.k === 'class' || region?.k === 'init'
    ? (classOf(view, region)?.primaryParameters ?? [])
    : [];
}

function sourceKind(view, parameter, { members }) {
  if (annotationIn(view.resolve, parameter.annotationEntries ?? [], VALUE) !== undefined) {
    return undefined;
  }
  const type = (parameter.type ?? '').replaceAll(/\s+/gu, '');
  if (TEXT_TYPES.test(type)) {
    return DIRECT;
  }
  return members && type !== '' && !VALUE_TYPES.test(type) && !type.includes('->')
    ? MEMBER
    : undefined;
}

function spread(view, region, taint) {
  const inRegion = ({ scope }) => regionOf(view, scope)?.id === region.id;
  const locals = view.file.locals.filter(inRegion);
  const assignments = view.file.invocations.filter(
    (invocation) =>
      invocation.assign === true && invocation.receiver === undefined && inRegion(invocation),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const { name, text } of [
      ...locals.map((local) => ({ name: local.name, text: local.value })),
      ...assignments.map((assigned) => ({
        name: assigned.name,
        text: assigned.arguments[0]?.text,
      })),
    ]) {
      if (taint.get(name) !== DIRECT && readsTainted(text, taint)) {
        taint.set(name, DIRECT);
        changed = true;
      }
    }
  }
  return taint;
}

function argumentFor(invocation, fn, index) {
  const parameter = fn.parameters[index];
  const named = invocation.arguments.find(({ name }) => name === parameter.name);
  if (named !== undefined) {
    return named;
  }
  return invocation.arguments.filter(({ name }) => name === undefined)[index];
}

function callersOf(view, fn) {
  return view.file.invocations.filter(
    (invocation) =>
      invocation.name === fn.name &&
      invocation.reference !== true &&
      isSelfCall(view, invocation) &&
      ownerOf(view, invocation) === fn.owner &&
      acceptsArguments(fn, invocation.arguments.length),
  );
}

export function requestTaint(view, { members }) {
  const done = new Map();
  const taintOf = (region, depth) => {
    if (region === undefined || depth > HELPER_DEPTH) {
      return new Map();
    }
    if (!done.has(region.id)) {
      done.set(region.id, new Map());
      const fn = region.k === 'fun' ? view.functionOf(region) : undefined;
      const taint = new Map();
      parametersOf(view, region).forEach((parameter, index) => {
        const kind = sourceKind(view, parameter, { members });
        const reached =
          fn?.visibility !== 'private' ||
          callersOf(view, fn).some((caller) =>
            readsTainted(
              argumentFor(caller, fn, index)?.text,
              taintOf(regionOf(view, caller.scope), depth + 1),
            ),
          );
        if (kind !== undefined && reached) {
          taint.set(parameter.name, kind);
        }
      });
      done.set(region.id, spread(view, region, taint));
    }
    return done.get(region.id);
  };
  return (scopeId) => taintOf(regionOf(view, scopeId), 0);
}
