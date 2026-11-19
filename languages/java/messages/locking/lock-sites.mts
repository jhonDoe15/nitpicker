import { escapeRegExp as untypedEscapeRegExp } from '../../../../shared/paths/glob.mjs';
import { closingIndex } from '../../source/brackets.mts';
import type { Member, OutlineType } from '../java-members.mts';

const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

type BodyMember = Member & { end: number };
export type LockSite = { key: string; at: number; end: number; method?: true };
export type MemberSite = LockSite & { member: Member };

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

function declaredBefore(text: string, index: number): boolean {
  const token = TYPE_BEFORE.exec(text.slice(Math.max(0, index - DECLARATION_REACH), index))?.[1];
  return token !== undefined && !NOT_TYPES.has(token);
}

function declaredIn(body: string, name: string): boolean {
  const declaration = new RegExp(String.raw`(?<![\w$.])${escapeRegExp(name)}\s*[=;,):]`, 'gu');
  return [...body.matchAll(declaration)].some((match) => declaredBefore(body, match.index));
}

function ownKey(key: string, body: string): boolean {
  return key.includes('.') || key === 'this' || !declaredIn(body, key);
}

function lockKey(expression: string, type: OutlineType): string {
  const plain = expression.replaceAll(SPACES, '').replace(THIS_PREFIX, '');
  const own = `${type.name}.`;
  const qualified = plain.endsWith('.class') || plain.endsWith('.this');
  return plain.startsWith(own) && !qualified ? plain.slice(own.length) : plain;
}

function blockSites(text: string, member: BodyMember, type: OutlineType): LockSite[] {
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

function callSites(text: string, member: BodyMember, type: OutlineType): LockSite[] {
  const body = text.slice(member.start, member.end);
  return [...body.matchAll(LOCK_CALL)].flatMap((match) => {
    const key = lockKey(match[1] ?? '', type);
    if (!ownKey(key, body)) {
      return [];
    }
    const after = match.index + match[0].length;
    const unlock = new RegExp(
      String.raw`(?<![\w$.])(?:this\s*\.\s*)?${escapeRegExp(match[1] ?? '')}\s*\.\s*unlock\s*\(`,
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

function methodSite(text: string, member: BodyMember, type: OutlineType): LockSite[] {
  const header = text.slice(member.start, text.indexOf('{', member.start));
  if (member.kind !== 'method' || !SYNCHRONIZED_MODIFIER.test(header)) {
    return [];
  }
  const key = STATIC_MODIFIER.test(header) ? `${type.name}.class` : 'this';
  return [{ key, at: member.start, end: member.end, method: true }];
}

function memberSites(text: string, member: BodyMember, type: OutlineType): MemberSite[] {
  return [
    ...methodSite(text, member, type),
    ...blockSites(text, member, type),
    ...callSites(text, member, type),
  ].map((site) => ({ ...site, member }));
}

export function typeSites(text: string, type: OutlineType): MemberSite[] {
  return type.members
    .filter(
      (member): member is BodyMember => BODY_MEMBERS.has(member.kind) && member.end !== undefined,
    )
    .flatMap((member) => memberSites(text, member, type));
}

export function holding<Site extends LockSite>(sites: readonly Site[], at: number): Site[] {
  return sites
    .filter((site) => site.at < at && at < site.end)
    .sort((left, right) => right.at - left.at);
}

export function fieldAt(text: string, at: number): string | undefined {
  return FIELD_START.exec(text.slice(at))?.[1];
}

function writePattern(name: string): RegExp {
  const field = new RegExp(String.raw`(?:this\s*\.\s*)?${escapeRegExp(name)}`, 'u');
  const operator = String.raw`(?:\+\+|--|(?:[-+*/%&|^]|<<|>>>?)?=(?!=))`;
  return new RegExp(
    String.raw`(?:\+\+|--)\s*${field.source}(?![\w$])|(?<![\w$.])${field.source}\s*${operator}`,
    'gu',
  );
}

export function lockedWrites(
  text: string,
  { sites, name }: { sites: readonly MemberSite[]; name: string },
): { at: number; lock: MemberSite }[] {
  return [...text.matchAll(writePattern(name))].flatMap((match) => {
    if (declaredBefore(text, match.index)) {
      return [];
    }
    const lock = holding(sites, match.index)[0];
    return lock?.member.kind === 'method' ? [{ at: match.index, lock }] : [];
  });
}
