import { functionsOf } from '../functions.mjs';
import { closeOf, remembered } from '../text-scan.mjs';
import { statementStart } from '../hosts.mjs';

const FACTORY_STYLES =
  'funSpec|stringSpec|shouldSpec|describeSpec|behaviorSpec|freeSpec|wordSpec|featureSpec|expectSpec';
const FACTORY_BUILDER = new RegExp(String.raw`(?<![\w.\x60])(?:${FACTORY_STYLES})\s*(?=\{)`, 'gu');
const ASSIGNED_NAME = /(?:val|var)\s+(\w+)\s*(?::[^=]+)?=\s*$/u;
const CALL_NAME = /(?<![\w.`])(?:this\s*\.\s*)?(\w+)\s*(?=\()/gu;
const SCOPE_RECEIVER = /(?:Spec|Scope|Context)$/u;
const INCLUDED = /(\w+)(?:\s*\(\s*\))?\s*$/u;

function isRegistrationHelper(fn) {
  return fn.receiver !== '' && SCOPE_RECEIVER.test(fn.receiver);
}

function helpersOf(functions) {
  const helpers = new Map();
  for (const fn of functions.filter(isRegistrationHelper)) {
    helpers.set(fn.name, [...(helpers.get(fn.name) ?? []), fn.body]);
  }
  return helpers;
}

function factoryName(scanned, functions, index) {
  const owner = functions.find(({ body }) => body.start <= index && index < body.end);
  if (owner !== undefined) {
    return owner.name;
  }
  const { code } = scanned;
  return ASSIGNED_NAME.exec(code.slice(statementStart(code, index), index))?.[1];
}

function factoriesOf(scanned, functions) {
  const { code } = scanned;
  return [...code.matchAll(FACTORY_BUILDER)].map((match) => {
    const open = match.index + match[0].length;
    return {
      name: factoryName(scanned, functions, match.index),
      offset: match.index,
      body: { start: open + 1, end: closeOf(scanned, open) },
    };
  });
}

function linksOf({ scanned }) {
  return remembered(scanned, 'kotest-links', () => {
    const functions = functionsOf(scanned);
    return { helpers: helpersOf(functions), factories: factoriesOf(scanned, functions) };
  });
}

function includedRanges(links, { args, open }) {
  const name = INCLUDED.exec(args.split(',').at(-1))?.[1];
  return links.factories
    .filter(
      (factory) =>
        (name !== undefined && factory.name === name) ||
        (factory.offset > open && factory.offset < open + args.length),
    )
    .map(({ body }) => body);
}

export function linkedRanges(view, range, accepts) {
  const links = linksOf(view);
  const { scanned } = view;
  const { code } = scanned;
  return [...code.slice(range.start, range.end).matchAll(CALL_NAME)].flatMap((match) => {
    const open = range.start + match.index + match[0].length;
    if (!accepts(range.start + match.index)) {
      return [];
    }
    if (match[1] === 'include') {
      const args = code.slice(open + 1, closeOf(scanned, open));
      return includedRanges(links, { args, open });
    }
    return links.helpers.get(match[1]) ?? [];
  });
}
