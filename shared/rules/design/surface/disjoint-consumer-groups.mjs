import { DESIGN_RULE_IDS } from '../../../project-rules/design-rules.mjs';
import { quoted } from '../design-finding.mjs';
import { listSites } from '../design-index.mjs';

const RULE = DESIGN_RULE_IDS.disjointConsumerGroups;
const MIN_USED_MEMBERS = 4;
const MIN_GROUP_MEMBERS = 2;
const OWNER_KINDS = new Set(['class', 'module']);

function consumersByMember(owner, members, index) {
  const ids = new Set(members.map(({ id }) => id));
  const consumers = new Map();
  for (const caller of index.callables.filter(({ file }) => file !== owner.file)) {
    for (const { target } of caller.calls ?? []) {
      if (ids.has(target)) {
        consumers.set(target, new Set([...(consumers.get(target) ?? []), caller.file]));
      }
    }
  }
  return consumers;
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
      const groups = [];
      for (const start of ids.filter((id) => !seen.has(id))) {
        const group = [start];
        seen.add(start);
        for (const id of group) {
          const next = [...links.get(id)].filter((linked) => !seen.has(linked));
          for (const linked of next) {
            seen.add(linked);
          }
          group.push(...next);
        }
        groups.push(group.sort());
      }
      return groups;
    },
  };
}

function internalResources(member, index) {
  const resources = new Set([
    `helper:${member.id}`,
    ...(member.ownFields ?? []).map((field) => `field:${field}`),
  ]);
  const pending = [member];
  const seen = new Set([member.id]);
  for (const current of pending) {
    for (const helper of (current.calls ?? []).map(({ target }) => index.callable(target))) {
      if (helper?.owner === member.owner && !seen.has(helper.id)) {
        seen.add(helper.id);
        resources.add(`helper:${helper.id}`);
        for (const field of helper.ownFields ?? []) {
          resources.add(`field:${field}`);
        }
        pending.push(helper);
      }
    }
  }
  return resources;
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
  return `${quoted(names)} (used by ${listSites(files, 3)})`;
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
      message: `${owner.name} serves ${String(groups.length)} separate groups of callers that share no state or helper inside it: ${described.join('; ')}. Each caller still depends on all of ${owner.name}; give each group its own smaller module or interface.`,
    });
  });
}
