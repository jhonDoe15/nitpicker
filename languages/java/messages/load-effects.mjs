import { existsSync, readFileSync } from 'node:fs';
import {
  blankLiterals,
  expressionAt,
  offsetOf,
  pathInside,
} from '../adapters/review-rules/java-sources.mjs';
import { javaOutline, placeAt } from './java-members.mjs';

export const LOAD_EFFECT_RULE = 'ClassLoadEffect';
const SUBJECT_KEY = 'nitpicker/subject';
const GENERIC_PLACE =
  'this call runs while its class loads (in a static field or block, an enum constant, the constructor or initializer of an instance created at load, or a method one of them calls)';
const MAX_CALL_LENGTH = 100;
const OPENERS = new Set(['(', '[', '{']);
const CLOSERS = new Set([')', ']', '}']);
const CHAINED_LINE = /[^\S\n]*\n\s*\./gu;
const SITE_ORDER = { field: 0, 'static-block': 0, constant: 0, constructor: 1, initializer: 1 };

function collapsedArguments(expression) {
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

export function shortCall(text) {
  const call = collapsedArguments(text.trim().replaceAll(CHAINED_LINE, '.')).replaceAll(
    /\s+/gu,
    ' ',
  );
  return call.length > MAX_CALL_LENGTH ? `${call.slice(0, MAX_CALL_LENGTH)}...` : call;
}

function sourceFacts(cache, { projectRoot, file }) {
  if (!cache.has(file)) {
    const full = pathInside(projectRoot, file);
    const source = existsSync(full) ? readFileSync(full, 'utf8') : undefined;
    const text = source === undefined ? undefined : blankLiterals(source);
    cache.set(file, source === undefined ? undefined : { source, text, types: javaOutline(text) });
  }
  return cache.get(file);
}

function callText(facts, start) {
  const extent = expressionAt(facts.text, start).trimEnd().length;
  return shortCall(facts.source.slice(start, start + extent));
}

function memberKey(member) {
  const keys = {
    'static-block': 'static {}',
    initializer: '{}',
    method: `${member.name}()`,
    constructor: `${member.name}()`,
  };
  return keys[member.kind] ?? member.name;
}

function siteCalling(type, { text, name }) {
  const call = new RegExp(String.raw`(?<![\w$])${name.replaceAll('$', String.raw`\$`)}\s*\(`, 'u');
  return type.members
    .filter((member) => member.kind in SITE_ORDER && member.end !== undefined)
    .filter((member) => call.test(text.slice(member.start, member.end)))
    .sort((left, right) => SITE_ORDER[left.kind] - SITE_ORDER[right.kind])[0];
}

function memberText(member) {
  const texts = {
    field: `${member.isStatic ? 'static ' : ''}field ${member.name}`,
    'static-block': 'a static block',
    initializer: 'an instance initializer',
    constant: `enum constant ${member.name}`,
    constructor: `constructor ${member.name}`,
  };
  return texts[member.kind] ?? `method ${member.name}`;
}

function placeText({ type, member }, text) {
  if (member.kind !== 'method') {
    const created =
      member.isStatic || member.kind === 'constant' ? '' : ' of an instance created at load';
    return `in ${memberText(member)}${created}`;
  }
  const site = siteCalling(type, { text, name: member.name });
  return site === undefined
    ? `in method ${member.name}, which load-time code calls`
    : `in method ${member.name}, which ${memberText(site)} calls`;
}

function named(result, { cache, projectRoot }) {
  const location = result.locations?.[0]?.physicalLocation;
  const file = location?.artifactLocation?.uri;
  const facts = typeof file === 'string' ? sourceFacts(cache, { projectRoot, file }) : undefined;
  if (facts === undefined || location.region?.startLine === undefined) {
    return result;
  }
  const start = offsetOf(facts.source, {
    line: location.region.startLine,
    column: location.region.startColumn,
  });
  const place = placeAt(facts.types, start);
  const call = callText(facts, start);
  if (place?.member === undefined || call === '') {
    return result;
  }
  const subject = `${place.type.name}.${memberKey(place.member)}: ${call}`;
  const evidence = `\`${call}\` runs while ${place.type.name} loads (${placeText(place, facts.text)})`;
  return {
    ...result,
    message: { ...result.message, text: result.message.text.replace(GENERIC_PLACE, evidence) },
    partialFingerprints: { ...result.partialFingerprints, [SUBJECT_KEY]: subject },
  };
}

export function withLoadEffectSubjects(log, { projectRoot }) {
  const cache = new Map();
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) =>
        result.ruleId === LOAD_EFFECT_RULE && projectRoot !== undefined
          ? named(result, { cache, projectRoot })
          : result,
      ),
    })),
  };
}
