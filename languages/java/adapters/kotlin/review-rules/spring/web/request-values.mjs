import { annotationIn } from '../spring-names.mjs';
import { acceptsArguments, isSelfCall, ownerOf } from '../spring-scopes.mjs';
import { VALUE } from '../spring-types.mjs';

const REGIONS = new Set(['fun', 'init', 'class', 'object']);
const TEXT_TYPES = /^(?:(?:kotlin\.)?(?:String|CharSequence)|(?:java\.net\.)?(?:URI|URL))\??$/u;
const VALUE_TYPES = /^(?:Int|Long|Short|Byte|Double|Float|Boolean|Char|Unit|Number)\??$/u;
const TOKEN =
  /"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[\p{L}_][\p{L}\p{N}_]*|\d[\p{L}\p{N}_.]*/gu;
const RAW_ENTRY = /\$(?:\{([^}]*)\}|([\p{L}_][\p{L}\p{N}_]*))/gu;
const ENTRY = /(?<!\\)\$(?:\{([^}]*)\}|([\p{L}_][\p{L}\p{N}_]*))/gu;
const NAME_START = /^[\p{L}_]/u;
const MEMBER_AFTER = /^\s*\??\./u;
const NAMED_ARGUMENT = /^\s*=(?!=)/u;
const SELECTED_BEFORE = /(?:\.|\?\.|::)\s*$/u;
const TEMPLATE_CALLS = [
  'buildAndExpand',
  'expand',
  'path',
  'pathSegment',
  'queryParam',
  'queryParams',
  'replaceQueryParam',
  'uriVariables',
];
const TEMPLATE_CALL = new RegExp(
  String.raw`(?:\.|\?\.)\s*(?:${TEMPLATE_CALLS.join('|')})\s*\(`,
  'gu',
);
const PAREN_STEP = { '(': 1, ')': -1 };
const DIRECT = 'direct';
const MEMBER = 'member';
const NO_TAINT = new Map();

function closingParen(text, start) {
  let depth = 1;
  for (const [offset, char] of [...text.slice(start)].entries()) {
    depth += PAREN_STEP[char] ?? 0;
    if (depth === 0) {
      return start + offset;
    }
  }
  return text.length;
}

function withoutTemplateArguments(text) {
  let open = text;
  for (const match of text.matchAll(TEMPLATE_CALL)) {
    const start = match.index + match[0].length;
    const end = closingParen(text, start);
    open = `${open.slice(0, start)}${' '.repeat(end - start)}${open.slice(end)}`;
  }
  return open;
}

function templateEntries(token) {
  const entries = [...token.matchAll(token.startsWith('"""') ? RAW_ENTRY : ENTRY)];
  return {
    names: entries
      .filter(([, , name]) => name !== undefined)
      .map(([, , name]) => ({ name, member: false })),
    inner: entries
      .filter(([, expression]) => expression !== undefined)
      .map(([, expression]) => expression),
  };
}

function rootReference(text, index, name) {
  const after = text.slice(index + name.length);
  return SELECTED_BEFORE.test(text.slice(0, index)) || NAMED_ARGUMENT.test(after)
    ? []
    : [{ name, member: MEMBER_AFTER.test(after) }];
}

function scan(text) {
  const open = withoutTemplateArguments(text);
  const found = [];
  const inner = [];
  for (const match of open.matchAll(TOKEN)) {
    const [token] = match;
    if (token.startsWith('"')) {
      const entries = templateEntries(token);
      found.push(...entries.names);
      inner.push(...entries.inner);
    } else if (NAME_START.test(token)) {
      found.push(...rootReference(open, match.index, token));
    }
  }
  return { found, inner };
}

export function referencesIn(text) {
  const pending = [text];
  const found = [];
  for (const current of pending) {
    const scanned = scan(current);
    found.push(...scanned.found);
    pending.push(...scanned.inner);
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

function parametersOf(view, region) {
  if (region.k === 'fun') {
    return view.functionOf(region)?.parameters ?? [];
  }
  return region.k === 'class' || region.k === 'init'
    ? (classOf(view, region)?.primaryParameters ?? [])
    : [];
}

function sourceKind(view, parameter, members) {
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

function inRegion(view, scope, region) {
  return regionOf(view, scope)?.id === region.id;
}

function carriers(view, region) {
  return [
    ...view.file.locals
      .filter(({ scope }) => inRegion(view, scope, region))
      .map(({ name, value }) => ({ name, text: value })),
    ...view.file.invocations
      .filter(({ assign, receiver }) => assign === true && receiver === undefined)
      .filter(({ scope }) => inRegion(view, scope, region))
      .map(({ name, arguments: given }) => ({ name, text: given[0]?.text })),
  ];
}

function spread(view, region, taint) {
  const entries = carriers(view, region);
  const pending = [...entries];
  for (const entry of pending) {
    if (taint.get(entry.name) !== DIRECT && readsTainted(entry.text, taint)) {
      taint.set(entry.name, DIRECT);
      pending.push(...entries.filter(({ name }) => taint.get(name) !== DIRECT));
    }
  }
}

function argumentFor(invocation, fn, index) {
  const named = invocation.arguments.find(({ name }) => name === fn.parameters[index].name);
  return named ?? invocation.arguments.filter(({ name }) => name === undefined)[index];
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

function reach(view, { region, fn, members }, taints) {
  const taint = taints.get(region.id);
  const callers = callersOf(view, fn);
  const added = fn.parameters.filter(
    (parameter, index) =>
      !taint.has(parameter.name) &&
      sourceKind(view, parameter, members) !== undefined &&
      callers.some((caller) =>
        readsTainted(
          argumentFor(caller, fn, index)?.text,
          taints.get(regionOf(view, caller.scope)?.id) ?? NO_TAINT,
        ),
      ),
  );
  for (const parameter of added) {
    taint.set(parameter.name, sourceKind(view, parameter, members));
  }
  return added.length > 0;
}

function sources(view, region, members) {
  const fn = region.k === 'fun' ? view.functionOf(region) : undefined;
  const parameters = fn?.visibility === 'private' ? [] : parametersOf(view, region);
  return new Map(
    parameters
      .map((parameter) => [parameter.name, sourceKind(view, parameter, members)])
      .filter(([, kind]) => kind !== undefined),
  );
}

export function requestTaint(view, { members }) {
  const regions = view.file.scopes.filter(({ k }) => REGIONS.has(k));
  const taints = new Map(regions.map((region) => [region.id, sources(view, region, members)]));
  const helpers = regions
    .map((region) => ({
      region,
      fn: region.k === 'fun' ? view.functionOf(region) : undefined,
      members,
    }))
    .filter(({ fn }) => fn?.visibility === 'private');
  const pending = [...regions];
  for (const region of pending) {
    spread(view, region, taints.get(region.id));
    pending.push(
      ...helpers.filter((helper) => reach(view, helper, taints)).map((helper) => helper.region),
    );
  }
  return (scopeId) => taints.get(regionOf(view, scopeId)?.id) ?? NO_TAINT;
}
