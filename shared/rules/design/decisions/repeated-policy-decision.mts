import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { quoted } from '../design-finding.mts';
import { displayName, listSites } from '../design-index.mts';
import { byText } from '../../../text-order/by-text.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCallable,
  DesignDecision,
  DesignFinding,
  DesignIndex,
  DesignType,
} from '../typed/design-types.mts';

type SubjectOwner = {
  readonly type: DesignType;
  readonly label: string;
  readonly cases: readonly string[] | undefined;
};
type DecisionSite = { readonly callable: DesignCallable; readonly line: number };
type DecisionEntry = {
  readonly subject: string;
  readonly owner: SubjectOwner;
  readonly group: string[];
  readonly sites: DecisionSite[];
};

const RULE = DESIGN_RULE_IDS.repeatedPolicyDecision;
const MIN_GROUP = 2;
const MIN_MODULES = 2;

function subjectOwner(subject: string, index: DesignIndex): SubjectOwner | undefined {
  const type = index.type(subject);
  if (type !== undefined) {
    return { type, label: type.name, cases: type.cases };
  }
  const dot = subject.lastIndexOf('.');
  const owner = index.type(subject.slice(0, dot));
  return owner === undefined
    ? undefined
    : { type: owner, label: `${owner.name}.${subject.slice(dot + 1)}`, cases: undefined };
}

function classGroups(decision: DesignDecision, cases: readonly string[] | undefined): string[][] {
  return decision.groups
    .map((group) => [...new Set(group)].sort(byText))
    .filter((group) => group.length >= MIN_GROUP)
    .filter((group) => cases === undefined || group.length < cases.length);
}

function callableGroups(
  callable: DesignCallable,
  index: DesignIndex,
): { subject: string; owner: SubjectOwner; group: string[]; site: DecisionSite }[] {
  return (callable.decisions ?? []).flatMap((decision) => {
    const owner = subjectOwner(decision.subject, index);
    if (owner === undefined) {
      return [];
    }
    return classGroups(decision, owner.cases).map((group) => ({
      subject: decision.subject,
      owner,
      group,
      site: { callable, line: decision.line },
    }));
  });
}

function decisionSites(index: DesignIndex): DecisionEntry[] {
  const sites = new Map<string, DecisionEntry>();
  for (const { subject, owner, group, site } of index.callables.flatMap((callable) =>
    callableGroups(callable, index),
  )) {
    const key = `${subject}\0${group.join('\0')}`;
    const entry: DecisionEntry = sites.get(key) ?? { subject, owner, group, sites: [] };
    entry.sites.push(site);
    sites.set(key, entry);
  }
  return [...sites.values()];
}

function siteLabel({ callable, line }: DecisionSite): string {
  return `${callable.file}:${String(line)}`;
}

function suggestion(
  owner: SubjectOwner,
  sites: readonly DecisionSite[],
  index: DesignIndex,
): string {
  const home = sites.find(({ callable }) => callable.file === owner.type.file);
  if (home !== undefined) {
    const answer = `${displayName(home.callable, index)} already answers it next to ${owner.type.name}`;
    return `${answer}; call it from the other places`;
  }
  const form = owner.type.kind === 'enum' ? 'function' : 'method or function';
  return `give ${owner.type.name} one ${form} that answers it, and call it from each place`;
}

export function repeatedPolicyDecisionFindings(
  index: DesignIndex,
  finding: DesignFinding,
): Finding[] {
  return decisionSites(index)
    .filter(({ sites }) => new Set(sites.map(({ callable }) => callable.file)).size >= MIN_MODULES)
    .flatMap(({ subject, owner, group, sites }) => {
      const ordered = sites.toSorted(
        (left, right) =>
          left.callable.file.localeCompare(right.callable.file) || left.line - right.line,
      );
      return finding({
        rule: RULE,
        path: owner.type.file,
        identity: `${subject}|${group.join(',')}`,
        line: owner.type.line,
        message: [
          `${String(ordered.length)} decisions over ${owner.label} treat ${quoted(group)} as one case:`,
          `${listSites(ordered.map(siteLabel))}. That grouping is a rule of its own:`,
          `${suggestion(owner, ordered, index)}.`,
        ].join(' '),
      });
    });
}
