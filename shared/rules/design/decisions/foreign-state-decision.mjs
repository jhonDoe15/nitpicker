import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
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

function isForeign(type, callable) {
  return type?.kind === 'class' && type.file !== callable.file && callable.owner !== type.id;
}

function decidedReads(callable, index) {
  const byType = new Map();
  for (const read of callable.reads ?? []) {
    const type = index.type(read.type);
    if (isForeign(type, callable)) {
      const known = byType.get(type.id) ?? { type, decided: new Set(), line: read.line };
      for (const field of read.decided ?? []) {
        known.decided.add(field);
      }
      byType.set(type.id, known);
    }
  }
  return [...byType.values()]
    .map((read) => ({ ...read, decided: [...read.decided].sort() }))
    .filter(({ decided }) => decided.length >= MIN_FIELDS);
}

function callablePairs(callable, index) {
  return decidedReads(callable, index).flatMap((read) =>
    pairs(read.decided).map((pair) => ({ read, pair, callable })),
  );
}

function pairSites(index) {
  const sites = new Map();
  for (const { read, pair, callable } of index.callables
    .filter(({ entry }) => entry !== true)
    .flatMap((item) => callablePairs(item, index))) {
    const key = `${read.type.id}\0${pair.join('\0')}`;
    const entry = sites.get(key) ?? { type: read.type, sites: new Map() };
    entry.sites.set(callable.id, { callable, decided: read.decided, line: read.line });
    sites.set(key, entry);
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
  return groupsOf(index).flatMap(({ type, fields, sites }) =>
    finding({
      rule: RULE,
      path: type.file,
      identity: `${type.id}|${fields.join(',')}`,
      line: type.line,
      message: [
        `${String(sites.length)} functions outside ${type.name} decide on its ${quoted(fields)}:`,
        `${listSites(sites.map(({ callable }) => siteText(callable, index)))}.`,
        `${type.name} already has behaviour; give it a method that answers this question and call that,`,
        'so the rule lives with the state it reads.',
      ].join(' '),
    }),
  );
}
