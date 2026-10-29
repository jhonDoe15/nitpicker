import { existsSync, readFileSync } from 'node:fs';
import { blankLiterals, offsetOf, pathInside } from '../adapters/review-rules/java-sources.mjs';
import { javaOutline, placeAt } from './java-members.mjs';
import { fieldAt, holding, lockedWrites, typeSites } from './lock-sites.mjs';

export const LOCK_ORDER_RULE = 'LockOrderInversion';
export const FIELD_LOCKING_RULE = 'InconsistentFieldLocking';
const SUBJECT_KEY = 'nitpicker/subject';
const ORDER_PLACE =
  'This nesting takes two locks of the class in the opposite order to another nesting of the class';
const FIELD_PLACE =
  'This write of a field holds no lock, while another write of the same field in the class holds one';

function sourceFacts(cache, { projectRoot, file }) {
  if (!cache.has(file)) {
    const full = pathInside(projectRoot, file);
    const text = existsSync(full) ? blankLiterals(readFileSync(full, 'utf8')) : undefined;
    cache.set(file, text === undefined ? undefined : { text, types: javaOutline(text) });
  }
  return cache.get(file);
}

function memberName(member) {
  return member.kind === 'method' ? `${member.name}()` : (member.name ?? member.kind);
}

function reversed(sites, { outer, inner }) {
  return sites.find(
    (site) =>
      site.key === outer.key &&
      holding(
        sites.filter((other) => other.member === site.member),
        site.at,
      ).some(({ key }) => key === inner.key),
  );
}

function orderEvidence(facts, place, at) {
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

function fieldEvidence(facts, place, at) {
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

const RULES = {
  [LOCK_ORDER_RULE]: { evidence: orderEvidence, place: ORDER_PLACE },
  [FIELD_LOCKING_RULE]: { evidence: fieldEvidence, place: FIELD_PLACE },
};

function named(result, { cache, projectRoot }) {
  const location = result.locations?.[0]?.physicalLocation;
  const file = location?.artifactLocation?.uri;
  const facts = typeof file === 'string' ? sourceFacts(cache, { projectRoot, file }) : undefined;
  if (facts === undefined || location.region?.startLine === undefined) {
    return result;
  }
  const at = offsetOf(facts.text, {
    line: location.region.startLine,
    column: location.region.startColumn,
  });
  const place = placeAt(facts.types, at);
  const rule = RULES[result.ruleId];
  const found = place?.member === undefined ? undefined : rule.evidence(facts, place, at);
  if (found === undefined) {
    return result;
  }
  return {
    ...result,
    message: { ...result.message, text: result.message.text.replace(rule.place, found.text) },
    partialFingerprints: { ...result.partialFingerprints, [SUBJECT_KEY]: found.subject },
  };
}

export function withLockEvidence(log, { projectRoot }) {
  const cache = new Map();
  return {
    ...log,
    runs: (log.runs ?? []).map((run) => ({
      ...run,
      results: (run.results ?? []).map((result) =>
        Object.hasOwn(RULES, result.ruleId) && projectRoot !== undefined
          ? named(result, { cache, projectRoot })
          : result,
      ),
    })),
  };
}
