import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { quoted } from '../design-finding.mts';
import { listSites, siteText } from '../design-index.mts';
import { byText } from '../../../text-order/by-text.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCallable,
  DesignFinding,
  DesignIndex,
  DesignType,
} from '../typed/design-types.mts';

type ForeignRead = { readonly type: DesignType; readonly decided: string[]; readonly line: number };
type PairSite = {
  readonly callable: DesignCallable;
  readonly decided: readonly string[];
  readonly line: number;
};
type PairEntry = { readonly type: DesignType; readonly sites: Map<string, PairSite> };

const RULE = DESIGN_RULE_IDS.foreignStateDecision;
const MIN_FIELDS = 2;
const MIN_SITES = 2;

function pairs(fields: readonly string[]): [string, string][] {
  return fields.flatMap((first, position) =>
    fields.slice(position + 1).map((second): [string, string] => [first, second]),
  );
}

function isForeign(type: DesignType | undefined, callable: DesignCallable): boolean {
  return type?.kind === 'class' && type.file !== callable.file && callable.owner !== type.id;
}

function decidedReads(callable: DesignCallable, index: DesignIndex): ForeignRead[] {
  const byType = new Map<string, ForeignRead>();
  const foreign = (callable.reads ?? []).flatMap((read) => {
    const type = index.type(read.type);
    return type !== undefined && isForeign(type, callable) ? [{ read, type }] : [];
  });
  for (const { read, type } of foreign) {
    const known: ForeignRead = byType.get(type.id) ?? { type, decided: [], line: read.line };
    byType.set(type.id, { ...known, decided: [...known.decided, ...(read.decided ?? [])] });
  }
  return [...byType.values()]
    .map((read) => ({ ...read, decided: [...new Set(read.decided)].sort(byText) }))
    .filter(({ decided }) => decided.length >= MIN_FIELDS);
}

function callablePairs(
  callable: DesignCallable,
  index: DesignIndex,
): { read: ForeignRead; pair: [string, string]; callable: DesignCallable }[] {
  return decidedReads(callable, index).flatMap((read) =>
    pairs(read.decided).map((pair) => ({ read, pair, callable })),
  );
}

function pairSites(index: DesignIndex): PairEntry[] {
  const sites = new Map<string, PairEntry>();
  for (const { read, pair, callable } of index.callables
    .filter(({ entry }) => entry !== true)
    .flatMap((item) => callablePairs(item, index))) {
    const key = `${read.type.id}\0${pair.join('\0')}`;
    const entry: PairEntry = sites.get(key) ?? { type: read.type, sites: new Map() };
    entry.sites.set(callable.id, { callable, decided: read.decided, line: read.line });
    sites.set(key, entry);
  }
  return [...sites.values()].filter((entry) => entry.sites.size >= MIN_SITES);
}

function sharedFields(sites: readonly PairSite[]): string[] {
  const [first, ...rest] = sites;
  return (first?.decided ?? []).filter((field) =>
    rest.every(({ decided }) => decided.includes(field)),
  );
}

function groupsOf(index: DesignIndex): { type: DesignType; fields: string[]; sites: PairSite[] }[] {
  const groups = new Map<string, { type: DesignType; fields: string[]; sites: PairSite[] }>();
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

export function foreignStateDecisionFindings(
  index: DesignIndex,
  finding: DesignFinding,
): Finding[] {
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
