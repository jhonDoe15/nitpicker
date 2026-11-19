import { escapeRegExp as untypedEscapeRegExp } from '../../../shared/paths/glob.mjs';
import { blankLiterals, expressionAt, offsetOf } from '../adapters/review-rules/java-sources.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import type { Fields } from '../../../shared/values/readers.mts';
import { javaOutline, placeAt } from './java-members.mts';
import { factsReader, mapResults, factsAt, withEvidence } from './sarif-results.mts';
import type { Member, OutlineType } from './java-members.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

type Facts = { source: string; text: string; types: OutlineType[] };

export const LOAD_EFFECT_RULE = 'ClassLoadEffect';
const GENERIC_PLACE =
  'this call runs while its class loads (in a static field or block, an enum constant, the constructor or initializer of an instance created at load, or a method one of them calls)';
const MAX_CALL_LENGTH = 100;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const CHAINED_LINE = /[^\S\n]*\n\s*\./gu;
const SITE_ORDER: Record<string, number> = {
  field: 0,
  'static-block': 0,
  constant: 0,
  constructor: 1,
  initializer: 1,
};

function collapsedArguments(expression: string): string {
  let depth = 0;
  let text = '';
  for (const character of expression) {
    if (CLOSERS.has(character)) {
      depth -= 1;
    }
    if (depth === 0) {
      text += character;
    } else if (!text.endsWith('...')) {
      text += '...';
    }
    if (OPENERS.has(character)) {
      depth += 1;
    }
  }
  return text;
}

export function shortCall(text: string): string {
  const call = collapsedArguments(text.trim().replaceAll(CHAINED_LINE, '.')).replaceAll(
    /\s+/gu,
    ' ',
  );
  return call.length > MAX_CALL_LENGTH ? `${call.slice(0, MAX_CALL_LENGTH)}...` : call;
}

function callText(facts: Facts, start: number): string {
  const extent = expressionAt(facts.text, start).trimEnd().length;
  return shortCall(facts.source.slice(start, start + extent));
}

function memberKey(member: Member): string {
  const keys: Record<string, string | undefined> = {
    'static-block': 'static {}',
    initializer: '{}',
    method: `${textOf(member.name)}()`,
    constructor: `${textOf(member.name)}()`,
  };
  return keys[member.kind] ?? textOf(member.name);
}

function siteCalling(
  type: OutlineType,
  { text, name }: { text: string; name: string },
): Member | undefined {
  const call = new RegExp(String.raw`(?<![\w$])${escapeRegExp(name)}\s*\(`, 'u');
  return type.members
    .filter((member) => member.kind in SITE_ORDER && member.end !== undefined)
    .filter((member) => call.test(text.slice(member.start, member.end)))
    .reduce<Member | undefined>(
      (best, member) =>
        best === undefined || (SITE_ORDER[member.kind] ?? 0) < (SITE_ORDER[best.kind] ?? 0)
          ? member
          : best,
      undefined,
    );
}

function memberText(member: Member): string {
  const texts: Record<string, string | undefined> = {
    field: `${member.isStatic ? 'static ' : ''}field ${textOf(member.name)}`,
    'static-block': 'a static block',
    initializer: 'an instance initializer',
    constant: `enum constant ${textOf(member.name)}`,
    constructor: `constructor ${textOf(member.name)}`,
  };
  return texts[member.kind] ?? `method ${textOf(member.name)}`;
}

function placeText({ type, member }: { type: OutlineType; member: Member }, text: string): string {
  if (member.kind !== 'method') {
    const created =
      member.isStatic || member.kind === 'constant' ? '' : ' of an instance created at load';
    return `in ${memberText(member)}${created}`;
  }
  const site = siteCalling(type, { text, name: textOf(member.name) });
  return site === undefined
    ? `in method ${textOf(member.name)}, which load-time code calls`
    : `in method ${textOf(member.name)}, which ${memberText(site)} calls`;
}

function factsOf(source: string): Facts {
  const text = blankLiterals(source);
  return { source, text, types: javaOutline(text) };
}

function named(result: unknown, readFacts: (file: string) => Facts | undefined): unknown {
  const found = factsAt(result, readFacts);
  if (found === undefined) {
    return result;
  }
  const { site, facts } = found;
  const start = offsetOf(facts.source, site.position);
  const place = placeAt(facts.types, start);
  const call = callText(facts, start);
  if (place?.member === undefined || call === '') {
    return result;
  }
  const subject = `${place.type.name}.${memberKey(place.member)}: ${call}`;
  const evidence = `\`${call}\` runs while ${place.type.name} loads (${placeText({ type: place.type, member: place.member }, facts.text)})`;
  return withEvidence(result, {
    text: (current) => current.replace(GENERIC_PLACE, evidence),
    subject,
  });
}

export function withLoadEffectSubjects(
  log: Fields,
  { projectRoot }: { projectRoot?: string | undefined },
): Fields {
  const readFacts = projectRoot === undefined ? undefined : factsReader(projectRoot, factsOf);
  return mapResults(log, (result) =>
    fieldOf(result, 'ruleId') === LOAD_EFFECT_RULE && readFacts !== undefined
      ? named(result, readFacts)
      : result,
  );
}
