import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { displayName, listSites } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.repeatedPolicyDecision;
const MIN_GROUP = 2;
const MIN_MODULES = 2;

function subjectOwner(subject, index) {
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

function classGroups(decision, cases) {
  return decision.groups
    .map((group) => [...new Set(group)].sort())
    .filter((group) => group.length >= MIN_GROUP)
    .filter((group) => cases === undefined || group.length < cases.length);
}

function callableGroups(callable, index) {
  return (callable.decisions ?? []).flatMap((decision) => {
    const owner = subjectOwner(decision.subject, index);
    return (owner === undefined ? [] : classGroups(decision, owner.cases)).map((group) => ({
      subject: decision.subject,
      owner,
      group,
      site: { callable, line: decision.line },
    }));
  });
}

function decisionSites(index) {
  const sites = new Map();
  for (const { subject, owner, group, site } of index.callables.flatMap((callable) =>
    callableGroups(callable, index),
  )) {
    const key = `${subject}\0${group.join('\0')}`;
    const entry = sites.get(key) ?? { subject, owner, group, sites: [] };
    entry.sites.push(site);
    sites.set(key, entry);
  }
  return [...sites.values()];
}

function siteLabel({ callable, line }) {
  return `${callable.file}:${String(line)}`;
}

function suggestion(owner, sites, index) {
  const home = sites.find(({ callable }) => callable.file === owner.type.file);
  if (home !== undefined) {
    const answer = `${displayName(home.callable, index)} already answers it next to ${owner.type.name}`;
    return `${answer}; call it from the other places`;
  }
  const form = owner.type.kind === 'enum' ? 'function' : 'method or function';
  return `give ${owner.type.name} one ${form} that answers it, and call it from each place`;
}

export function repeatedPolicyDecisionFindings(index, finding) {
  return decisionSites(index)
    .filter(({ sites }) => new Set(sites.map(({ callable }) => callable.file)).size >= MIN_MODULES)
    .flatMap(({ subject, owner, group, sites }) => {
      const ordered = sites.toSorted(
        (left, right) =>
          left.callable.file.localeCompare(right.callable.file) || left.line - right.line,
      );
      const [first] = ordered;
      return finding({
        rule: RULE,
        path: first.callable.file,
        identity: `${subject}|${group.join(',')}`,
        line: first.line,
        message: [
          `${String(ordered.length)} decisions over ${owner.label} treat ${quoted(group)} as one case:`,
          `${listSites(ordered.map(siteLabel))}. That grouping is a rule of its own:`,
          `${suggestion(owner, ordered, index)}.`,
        ].join(' '),
      });
    });
}
