import { groupOf } from '../../typed/indexing.mts';
import type { FunctionInfo, KotestView, Span, TestScanned } from '../../typed/discovery-types.mts';

type Factory = { name: string | undefined; offset: number; body: Span };
type Links = { helpers: Map<string, Span[]>; factories: Factory[] };
import { functionsOf } from '../functions.mts';
import { closeOf, remembered } from '../text-scan.mts';
import { statementStart } from '../hosts.mts';

const FACTORY_STYLES =
  'funSpec|stringSpec|shouldSpec|describeSpec|behaviorSpec|freeSpec|wordSpec|featureSpec|expectSpec';
const FACTORY_BUILDER = new RegExp(String.raw`(?<![\w.\x60])(?:${FACTORY_STYLES})\s*(?=\{)`, 'gu');
const ASSIGNED_NAME = /(?:val|var)\s+(\w+)\s*(?::[^=]+)?=\s*$/u;
const CALL_NAME = /(?<![\w.`])(?:this\s*\.\s*)?(\w+)\s*(?=\()/gu;
const SCOPE_RECEIVER = /(?:Spec|Scope|Context)$/u;
const INCLUDED = /(\w+)(?:\s*\(\s*\))?\s*$/u;

function isRegistrationHelper(fn: FunctionInfo): boolean {
  return fn.receiver !== '' && SCOPE_RECEIVER.test(fn.receiver);
}

function helpersOf(functions: FunctionInfo[]): Map<string, Span[]> {
  const helpers = new Map<string, Span[]>();
  for (const fn of functions.filter(isRegistrationHelper)) {
    helpers.set(fn.name, [...(helpers.get(fn.name) ?? []), fn.body]);
  }
  return helpers;
}

function factoryName(
  scanned: TestScanned,
  functions: FunctionInfo[],
  index: number,
): string | undefined {
  const owner = functions.find(({ body }) => body.start <= index && index < body.end);
  if (owner !== undefined) {
    return owner.name;
  }
  const { code } = scanned;
  return ASSIGNED_NAME.exec(code.slice(statementStart(code, index), index))?.[1];
}

function factoriesOf(scanned: TestScanned, functions: FunctionInfo[]): Factory[] {
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

function linksOf({ scanned }: KotestView): Links {
  return remembered(scanned, 'kotest-links', () => {
    const functions = functionsOf(scanned);
    return { helpers: helpersOf(functions), factories: factoriesOf(scanned, functions) };
  });
}

function includedRanges(links: Links, { args, open }: { args: string; open: number }): Span[] {
  const name = INCLUDED.exec(args.split(',').at(-1) ?? '')?.[1];
  return links.factories
    .filter(
      (factory) =>
        (name !== undefined && factory.name === name) ||
        (factory.offset > open && factory.offset < open + args.length),
    )
    .map(({ body }) => body);
}

export function linkedRanges(
  view: KotestView,
  range: Span,
  accepts: (offset: number) => boolean,
): Span[] {
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
    return links.helpers.get(groupOf(match, 1)) ?? [];
  });
}
