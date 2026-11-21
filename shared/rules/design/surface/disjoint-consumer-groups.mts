import { DESIGN_RULE_IDS } from '../../../project-rules/design/design-rules.mts';
import { quoted } from '../design-finding.mts';
import { listSites } from '../design-index.mts';
import { byText } from '../../../text-order/by-text.mts';
import { appendAll, reachableFrom } from '../../../lists/lists.mts';
import type { Finding } from '../../../values/findings.mts';
import type {
  DesignCall,
  DesignCallable,
  DesignFinding,
  DesignIndex,
  DesignType,
} from '../typed/design-types.mts';

type Used = {
  readonly calls?: readonly DesignCall[];
  readonly references?: readonly string[] | undefined;
};
type Links = ReadonlyMap<string, Set<string>>;
type Linked = { join(group: readonly string[]): void; groups(): string[][] };
type Consumers = ReadonlyMap<string, ReadonlySet<string>>;

const RULE = DESIGN_RULE_IDS.disjointConsumerGroups;
const MIN_USED_MEMBERS = 4;
const MIN_GROUP_MEMBERS = 2;
const MAX_LISTED_FILES = 3;
const OWNER_KINDS = new Set(['class', 'module']);

function usedTargets(item: Used): string[] {
  return [...(item.calls ?? []).map(({ target }) => target), ...(item.references ?? [])];
}

type UsingFiles = ReadonlyMap<string, readonly string[]>;

function usingFilesByTarget(index: DesignIndex): UsingFiles {
  const uses = [...index.callables, ...index.types].flatMap((user) =>
    usedTargets(user).map((target) => ({ target, file: user.file })),
  );
  const files = new Map<string, string[]>();
  for (const { target, file } of uses) {
    const known = files.get(target) ?? [];
    known.push(file);
    files.set(target, known);
  }
  return files;
}

function consumersByMember(
  owner: DesignType,
  members: readonly DesignCallable[],
  usingFiles: UsingFiles,
): Map<string, Set<string>> {
  const consumers = new Map<string, Set<string>>();
  for (const { id } of members) {
    const files = (usingFiles.get(id) ?? []).filter((file) => file !== owner.file);
    if (files.length > 0) {
      consumers.set(id, new Set(files));
    }
  }
  return consumers;
}

function componentOf(
  start: string,
  { links, seen }: { readonly links: Links; readonly seen: Set<string> },
): string[] {
  const group = [
    ...reachableFrom([start], (id) =>
      [...(links.get(id) ?? [])].filter((linked) => !seen.has(linked)),
    ),
  ];
  for (const id of group) {
    seen.add(id);
  }
  return group.sort(byText);
}

function linkedGroups(ids: readonly string[]): Linked {
  const links = new Map(ids.map((id) => [id, new Set<string>()]));
  return {
    join(group: readonly string[]): void {
      const [head] = group;
      for (const id of group.slice(1)) {
        if (head !== undefined) {
          links.get(head)?.add(id);
          links.get(id)?.add(head);
        }
      }
    },
    groups(): string[][] {
      const seen = new Set<string>();
      return ids.flatMap((id) => (seen.has(id) ? [] : [componentOf(id, { links, seen })]));
    },
  };
}

function ownHelpers(
  current: DesignCallable,
  member: DesignCallable,
  { index, seen }: { readonly index: DesignIndex; readonly seen: Set<string> },
): DesignCallable[] {
  const helpers = usedTargets(current).flatMap((target) => {
    const helper = index.callable(target);
    return helper !== undefined && helper.owner === member.owner && !seen.has(helper.id)
      ? [helper]
      : [];
  });
  const fresh = [...new Map(helpers.map((helper) => [helper.id, helper])).values()];
  for (const helper of fresh) {
    seen.add(helper.id);
  }
  return fresh;
}

function internalResources(member: DesignCallable, index: DesignIndex): Set<string> {
  const pending = [member];
  const seen = new Set([member.id]);
  for (const current of pending) {
    appendAll(pending, ownHelpers(current, member, { index, seen }));
  }
  return new Set(
    pending.flatMap((callable) => [
      `helper:${callable.id}`,
      ...(callable.ownFields ?? []).map((field) => `field:${field}`),
    ]),
  );
}

function joinByConsumers(used: readonly string[], consumers: Consumers, sets: Linked): void {
  const byFile = new Map<string, string[]>();
  for (const id of used) {
    for (const file of consumers.get(id) ?? []) {
      byFile.set(file, [...(byFile.get(file) ?? []), id]);
    }
  }
  for (const ids of byFile.values()) {
    sets.join(ids);
  }
}

function joinByResources(used: readonly string[], index: DesignIndex, sets: Linked): void {
  const holders = new Map<string, string[]>();
  for (const id of used) {
    const member = index.callable(id);
    for (const resource of member === undefined ? [] : internalResources(member, index)) {
      holders.set(resource, [...(holders.get(resource) ?? []), id]);
    }
  }
  for (const ids of holders.values()) {
    sets.join(ids);
  }
}

function groupText(
  group: readonly string[],
  { consumers, index }: { readonly consumers: Consumers; readonly index: DesignIndex },
): string {
  const names = group.map((id) => index.callable(id)?.name ?? id).sort(byText);
  const files = [...new Set(group.flatMap((id) => [...(consumers.get(id) ?? [])]))].sort(byText);
  return `${quoted(names)} (used by ${listSites(files, MAX_LISTED_FILES)})`;
}

function ownerGroups(
  owner: DesignType,
  { index, usingFiles }: { readonly index: DesignIndex; readonly usingFiles: UsingFiles },
): { groups: string[][]; consumers: Consumers } {
  const members = index
    .members(owner.id)
    .filter(({ exported, entry, kind }) => exported && entry !== true && kind !== 'constructor');
  const consumers = consumersByMember(owner, members, usingFiles);
  const used = [...consumers.keys()].sort(byText);
  if (used.length < MIN_USED_MEMBERS) {
    return { groups: [], consumers };
  }
  const sets = linkedGroups(used);
  joinByConsumers(used, consumers, sets);
  joinByResources(used, index, sets);
  return { groups: sets.groups().filter((group) => group.length >= MIN_GROUP_MEMBERS), consumers };
}

export function disjointConsumerGroupFindings(
  index: DesignIndex,
  finding: DesignFinding,
): Finding[] {
  const owners = index.types.filter(
    (owner) => OWNER_KINDS.has(owner.kind) && owner.exported && !index.isPublished(owner),
  );
  const usingFiles = usingFilesByTarget(index);
  return owners.flatMap((owner) => {
    const { groups, consumers } = ownerGroups(owner, { index, usingFiles });
    if (groups.length < 2) {
      return [];
    }
    const described = groups.map((group) => groupText(group, { consumers, index })).sort(byText);
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
