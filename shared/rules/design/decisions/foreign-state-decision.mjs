import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { listSites, siteText } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.foreignStateDecision;
const MIN_FIELDS = 2;
const MIN_SITES = 2;

function pairs(fields) {
  return fields.flatMap((first, position) =>
    fields.slice(position + 1).map((second) => [first, second]),
  );
}

function decidedReads(callable, index) {
  return (callable.reads ?? []).flatMap((read) => {
    const type = index.type(read.type);
    const decided = [...new Set(read.decided ?? [])].sort();
    const foreign =
      type?.kind === 'class' &&
      type.file !== callable.file &&
      callable.owner !== type.id &&
      decided.length >= MIN_FIELDS;
    return foreign ? [{ type, decided, line: read.line }] : [];
  });
}

function pairSites(index) {
  const sites = new Map();
  for (const callable of index.callables.filter(({ entry }) => entry !== true)) {
    for (const read of decidedReads(callable, index)) {
      for (const pair of pairs(read.decided)) {
        const key = `${read.type.id}\0${pair.join('\0')}`;
        const entry = sites.get(key) ?? { type: read.type, sites: new Map() };
        entry.sites.set(callable.id, { callable, decided: read.decided, line: read.line });
        sites.set(key, entry);
      }
    }
  }
  return [...sites.values()].filter((entry) => entry.sites.size >= MIN_SITES);
}

function sharedFields(sites) {
  const [first, ...rest] = sites;
  return first.decided.filter((field) => rest.every(({ decided }) => decided.includes(field)));
}

function groupsOf(index) {
  const groups = new Map();
  for (const entry of pairSites(index)) {
    const sites = [...entry.sites.values()].toSorted(
      (left, right) =>
        left.callable.file.localeCompare(right.callable.file) || left.line - right.line,
    );
    const fields = sharedFields(sites);
    const key = `${entry.type.id}\0${sites.map(({ callable }) => callable.id).join('\0')}`;
    groups.set(key, { type: entry.type, fields, sites });
  }
  return [...groups.values()];
}

export function foreignStateDecisionFindings(index, finding) {
  return groupsOf(index).flatMap(({ type, fields, sites }) => {
    const [first] = sites;
    return finding({
      rule: RULE,
      path: first.callable.file,
      identity: `${type.id}|${fields.join(',')}`,
      line: first.line,
      message: `${String(sites.length)} functions outside ${type.name} decide on its ${quoted(fields)}: ${listSites(sites.map(({ callable }) => siteText(callable, index)))}. ${type.name} already has behaviour; give it a method that answers this question and call that, so the rule lives with the state it reads.`,
    });
  });
}
