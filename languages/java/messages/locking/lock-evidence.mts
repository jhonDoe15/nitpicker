import { blankLiterals, offsetOf } from '../../adapters/review-rules/java-sources.mts';
import { fieldOf, textOf } from '../../../../shared/values/readers.mts';
import type { Fields } from '../../../../shared/values/readers.mts';
import { javaOutline, placeAt } from '../java-members.mts';
import { factsReader, mapResults, factsAt, withEvidence, withSubject } from '../sarif-results.mts';
import type { Member, OutlineType } from '../java-members.mts';
import { fieldAt, holding, lockedWrites, typeSites } from './lock-sites.mts';
import type { MemberSite } from './lock-sites.mts';

type Facts = { text: string; types: OutlineType[] };
type Place = { type: OutlineType; member: Member | undefined };
type Evidence = { subject: string; text: string };
type RuleKind = {
  evidence: (facts: Facts, place: Place, at: number) => Evidence | undefined;
  subject: (facts: Facts, place: Place, at: number) => string | undefined;
  place: string;
};

export const LOCK_ORDER_RULE = 'LockOrderInversion';
export const FIELD_LOCKING_RULE = 'InconsistentFieldLocking';
const ORDER_PLACE =
  'This nesting takes two locks of the class in the opposite order to another nesting of the class';
const FIELD_PLACE =
  'This write of a field holds no lock, while another write of the same field in the class holds one';

function memberName(member: Member): string {
  return member.kind === 'method' ? `${textOf(member.name)}()` : (member.name ?? member.kind);
}

function reversed(
  sites: readonly MemberSite[],
  { outer, inner }: { outer: MemberSite; inner: MemberSite },
): MemberSite | undefined {
  return sites.find((site) => {
    const held = holding(
      sites.filter((other) => other.member === site.member),
      site.at,
    ).map(({ key }) => key);
    return site.key === outer.key && !held.includes(site.key) && held.includes(inner.key);
  });
}

function orderEvidence(facts: Facts, place: Place, at: number): Evidence | undefined {
  const sites = typeSites(facts.text, place.type);
  const inner = sites.find((site) => site.at === at && !site.method);
  if (inner === undefined) {
    return undefined;
  }
  const own = sites.filter((site) => site.member === inner.member);
  for (const outer of holding(own, at).filter(({ key }) => key !== inner.key)) {
    const other = reversed(sites, { outer, inner });
    if (other !== undefined) {
      const there =
        other.member === inner.member
          ? `another nesting in ${memberName(other.member)}`
          : memberName(other.member);
      return {
        subject: `${place.type.name}.${memberName(inner.member)}: ${outer.key} -> ${inner.key}`,
        text: `${memberName(inner.member)} takes \`${inner.key}\` while it holds \`${outer.key}\`, and ${there} takes \`${outer.key}\` while it holds \`${inner.key}\``,
      };
    }
  }
  return undefined;
}

function fieldEvidence(facts: Facts, place: Place, at: number): Evidence | undefined {
  const name = fieldAt(facts.text, at);
  if (name === undefined || place.member?.kind !== 'method') {
    return undefined;
  }
  const sites = typeSites(facts.text, place.type);
  const locked = lockedWrites(facts.text, { sites, name })[0];
  if (locked === undefined) {
    return undefined;
  }
  return {
    subject: `${place.type.name}.${memberName(place.member)}: ${name}`,
    text: `${memberName(place.member)} writes \`${name}\` without a lock, while ${memberName(locked.lock.member)} writes it holding \`${locked.lock.key}\``,
  };
}

function orderSubject(facts: Facts, place: Place, at: number): string | undefined {
  return typeSites(facts.text, place.type).find((site) => site.at === at && !site.method)?.key;
}

const RULES: Record<string, RuleKind> = {
  [LOCK_ORDER_RULE]: { evidence: orderEvidence, subject: orderSubject, place: ORDER_PLACE },
  [FIELD_LOCKING_RULE]: {
    evidence: fieldEvidence,
    subject: (facts, _place, at) => fieldAt(facts.text, at),
    place: FIELD_PLACE,
  },
};

function fallback(
  result: unknown,
  {
    facts,
    place,
    member,
    at,
    rule,
  }: { facts: Facts; place: Place; member: Member; at: number; rule: RuleKind },
): Fields {
  const subject = [`${place.type.name}.${memberName(member)}`, rule.subject(facts, place, at)]
    .filter((part) => part !== undefined)
    .join(': ');
  return withSubject(result, subject);
}

function factsOf(source: string): Facts {
  const text = blankLiterals(source);
  return { text, types: javaOutline(text) };
}

function named(result: unknown, readFacts: (file: string) => Facts | undefined): unknown {
  const located = factsAt(result, readFacts);
  if (located === undefined) {
    return result;
  }
  const { site, facts } = located;
  const at = offsetOf(facts.text, site.position);
  const place = placeAt(facts.types, at);
  const rule = RULES[textOf(fieldOf(result, 'ruleId'))];
  if (place?.member === undefined || rule === undefined) {
    return result;
  }
  const found = rule.evidence(facts, place, at);
  if (found === undefined) {
    return fallback(result, { facts, place, member: place.member, at, rule });
  }
  return withEvidence(result, {
    text: (current) => current.replace(rule.place, () => found.text),
    subject: found.subject,
  });
}

export function withLockEvidence(
  log: Fields,
  { projectRoot }: { projectRoot?: string | undefined },
): Fields {
  const readFacts = projectRoot === undefined ? undefined : factsReader(projectRoot, factsOf);
  return mapResults(log, (result) =>
    Object.hasOwn(RULES, textOf(fieldOf(result, 'ruleId'))) && readFacts !== undefined
      ? named(result, readFacts)
      : result,
  );
}
