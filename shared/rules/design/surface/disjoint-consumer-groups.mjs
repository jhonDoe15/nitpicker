import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { listSites } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.disjointConsumerGroups;
const MIN_USED_MEMBERS = 4;
const MIN_GROUP_MEMBERS = 2;
const MAX_LISTED_FILES = 3;
const OWNER_KINDS = new Set(['class', 'module']);

function consumersByMember(owner, members, index) {
  const ids = new Set(members.map(({ id }) => id));
  const consumers = new Map();
  for (const { target, file } of index.callables
    .filter((caller) => caller.file !== owner.file)
    .flatMap((caller) => (caller.calls ?? []).map(({ target }) => ({ target, file: caller.file })))
    .filter((call) => ids.has(call.target))) {
    consumers.set(target, new Set([...(consumers.get(target) ?? []), file]));
  }
  return consumers;
}

function componentOf(start, { links, seen }) {
  const group = [start];
  seen.add(start);
  for (const id of group) {
    const next = [...links.get(id)].filter((linked) => !seen.has(linked));
    for (const linked of next) {
      seen.add(linked);
    }
    group.push(...next);
  }
  return group.sort();
}

function linkedGroups(ids) {
  const links = new Map(ids.map((id) => [id, new Set()]));
  return {
    join(group) {
      for (const id of group.slice(1)) {
        links.get(group[0]).add(id);
        links.get(id).add(group[0]);
      }
    },
    groups() {
      const seen = new Set();
      return ids.flatMap((id) => (seen.has(id) ? [] : [componentOf(id, { links, seen })]));
    },
  };
}

function ownHelpers(current, member, { index, seen }) {
  const helpers = (current.calls ?? [])
    .map(({ target }) => index.callable(target))
    .filter((helper) => helper?.owner === member.owner && !seen.has(helper.id));
  const fresh = [...new Map(helpers.map((helper) => [helper.id, helper])).values()];
  for (const helper of fresh) {
    seen.add(helper.id);
  }
  return fresh;
}

function internalResources(member, index) {
  const pending = [member];
  const seen = new Set([member.id]);
  for (const current of pending) {
    pending.push(...ownHelpers(current, member, { index, seen }));
  }
  return new Set(
    pending.flatMap((callable) => [
      `helper:${callable.id}`,
      ...(callable.ownFields ?? []).map((field) => `field:${field}`),
    ]),
  );
}

function joinByConsumers(used, consumers, sets) {
  const byFile = new Map();
  for (const id of used) {
    for (const file of consumers.get(id)) {
      byFile.set(file, [...(byFile.get(file) ?? []), id]);
    }
  }
  for (const ids of byFile.values()) {
    sets.join(ids);
  }
}

function joinByResources(used, index, sets) {
  const holders = new Map();
  for (const id of used) {
    for (const resource of internalResources(index.callable(id), index)) {
      holders.set(resource, [...(holders.get(resource) ?? []), id]);
    }
  }
  for (const ids of holders.values()) {
    sets.join(ids);
  }
}

function groupText(group, { consumers, index }) {
  const names = group.map((id) => index.callable(id).name).sort();
  const files = [...new Set(group.flatMap((id) => [...consumers.get(id)]))].sort();
  return `${quoted(names)} (used by ${listSites(files, MAX_LISTED_FILES)})`;
}

function ownerGroups(owner, index) {
  const members = index
    .members(owner.id)
    .filter(({ exported, entry, kind }) => exported && entry !== true && kind !== 'constructor');
  const consumers = consumersByMember(owner, members, index);
  const used = [...consumers.keys()].sort();
  if (used.length < MIN_USED_MEMBERS) {
    return { groups: [], consumers };
  }
  const sets = linkedGroups(used);
  joinByConsumers(used, consumers, sets);
  joinByResources(used, index, sets);
  return { groups: sets.groups().filter((group) => group.length >= MIN_GROUP_MEMBERS), consumers };
}

export function disjointConsumerGroupFindings(index, finding) {
  const owners = index.types.filter(
    (owner) => OWNER_KINDS.has(owner.kind) && owner.exported && !index.isPublished(owner),
  );
  return owners.flatMap((owner) => {
    const { groups, consumers } = ownerGroups(owner, index);
    if (groups.length < 2) {
      return [];
    }
    const described = groups.map((group) => groupText(group, { consumers, index })).sort();
    return finding({
      rule: RULE,
      path: owner.file,
      identity: owner.id,
      symbol: owner.name,
      line: owner.line,
      message: [
        `${owner.name} serves ${String(groups.length)} separate groups of callers`,
        `that share no state or helper inside it: ${described.join('; ')}.`,
        `Each caller still depends on all of ${owner.name}; give each group its own smaller module or interface.`,
      ].join(' '),
    });
  });
}
