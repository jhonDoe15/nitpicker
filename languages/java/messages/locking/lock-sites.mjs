import { closingIndex } from '../../source/brackets.mjs';

const SYNCHRONIZED_BLOCK = /\bsynchronized\s*\(/gu;
const LOCK_CALL =
  /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*(?:lock|lockInterruptibly)\s*\(\s*\)\s*;/gu;
const SYNCHRONIZED_MODIFIER = /\bsynchronized\b/u;
const STATIC_MODIFIER = /\bstatic\b/u;
const THIS_PREFIX = /^this\s*\.\s*/u;
const SPACES = /\s+/gu;
const FIELD_START = /^(?:\+\+|--)?\s*(?:this\s*\.\s*)?([A-Za-z_$][\w$]*)/u;
const BODY_MEMBERS = new Set(['method', 'constructor', 'initializer', 'static-block']);
const NOT_TYPES = new Set(['return', 'throw', 'case', 'yield', 'else', 'do', 'assert', 'new']);
const TYPE_BEFORE = /([\w$>\]]+)\s+$/u;
const DECLARATION_REACH = 120;

function declaredBefore(text, index) {
  const token = TYPE_BEFORE.exec(text.slice(Math.max(0, index - DECLARATION_REACH), index))?.[1];
  return token !== undefined && !NOT_TYPES.has(token);
}

function declaredIn(body, name) {
  const declaration = new RegExp(String.raw`(?<![\w$.])${escaped(name)}\s*[=;,):]`, 'gu');
  return [...body.matchAll(declaration)].some((match) => declaredBefore(body, match.index));
}

function ownKey(key, body) {
  return key.includes('.') || key === 'this' || !declaredIn(body, key);
}

function lockKey(expression, type) {
  const plain = expression.replaceAll(SPACES, '').replace(THIS_PREFIX, '');
  const own = `${type.name}.`;
  const qualified = plain.endsWith('.class') || plain.endsWith('.this');
  return plain.startsWith(own) && !qualified ? plain.slice(own.length) : plain;
}

function escaped(text) {
  return text.replaceAll(/[.$]/gu, String.raw`\$&`);
}

function blockSites(text, member, type) {
  const body = text.slice(member.start, member.end);
  return [...body.matchAll(SYNCHRONIZED_BLOCK)].flatMap((match) => {
    const open = member.start + match.index + match[0].length - 1;
    const close = closingIndex(text, open);
    const brace = close < 0 ? -1 : text.indexOf('{', close);
    const end = brace < 0 ? -1 : closingIndex(text, brace);
    const key = lockKey(text.slice(open + 1, close), type);
    return end < 0 || !ownKey(key, body) ? [] : [{ key, at: member.start + match.index, end }];
  });
}

function callSites(text, member, type) {
  const body = text.slice(member.start, member.end);
  return [...body.matchAll(LOCK_CALL)].flatMap((match) => {
    const key = lockKey(match[1], type);
    if (!ownKey(key, body)) {
      return [];
    }
    const after = match.index + match[0].length;
    const unlock = new RegExp(
      String.raw`(?<![\w$.])(?:this\s*\.\s*)?${escaped(match[1])}\s*\.\s*unlock\s*\(`,
      'u',
    );
    const found = unlock.exec(body.slice(after));
    return [
      {
        key,
        at: member.start + match.index,
        end: found === null ? member.end : member.start + after + found.index,
      },
    ];
  });
}

function methodSite(text, member, type) {
  const header = text.slice(member.start, text.indexOf('{', member.start));
  if (member.kind !== 'method' || !SYNCHRONIZED_MODIFIER.test(header)) {
    return [];
  }
  const key = STATIC_MODIFIER.test(header) ? `${type.name}.class` : 'this';
  return [{ key, at: member.start, end: member.end, method: true }];
}

function memberSites(text, member, type) {
  return [
    ...methodSite(text, member, type),
    ...blockSites(text, member, type),
    ...callSites(text, member, type),
  ].map((site) => ({ ...site, member }));
}

export function typeSites(text, type) {
  return type.members
    .filter((member) => BODY_MEMBERS.has(member.kind) && member.end !== undefined)
    .flatMap((member) => memberSites(text, member, type));
}

export function holding(sites, at) {
  return sites
    .filter((site) => site.at < at && at < site.end)
    .sort((left, right) => right.at - left.at);
}

export function fieldAt(text, at) {
  return FIELD_START.exec(text.slice(at))?.[1];
}

function writePattern(name) {
  const field = String.raw`(?:this\s*\.\s*)?${escaped(name)}`;
  const operator = String.raw`(?:\+\+|--|(?:[-+*/%&|^]|<<|>>>?)?=(?!=))`;
  return new RegExp(
    String.raw`(?:\+\+|--)\s*${field}(?![\w$])|(?<![\w$.])${field}\s*${operator}`,
    'gu',
  );
}

export function lockedWrites(text, { sites, name }) {
  return [...text.matchAll(writePattern(name))].flatMap((match) => {
    if (declaredBefore(text, match.index)) {
      return [];
    }
    const lock = holding(sites, match.index)[0];
    return lock?.member.kind === 'method' ? [{ at: match.index, lock }] : [];
  });
}
