import type { KotlinFile } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';
import type { ClassScope, ItemScope, LockAcquisition } from './locking-types.mts';
import type { ClassIndex } from './locking-sites.mts';

type Site = {
  acquisition: LockAcquisition;
  klass: ClassScope;
  key: string;
  held: string[];
  member: string;
};

import { classView, enclosingClass, heldLocks, lockKey, unitOf } from './lock-scopes.mts';
import { LOCK_ORDER_RULE } from '../../../../../messages/locking/lock-evidence.mts';

function memberName(unit: ItemScope | undefined): string {
  return unit?.k === 'fun' ? (unit.name ?? '') : 'init';
}

function message({
  member,
  inner,
  outer,
  other,
}: {
  member: string;
  inner: string;
  outer: string;
  other: string;
}): string {
  const there = other === member ? `another nesting in \`${other}\`` : `\`${other}\``;
  return `\`${member}\` takes \`${inner}\` while it holds \`${outer}\`, and ${there} takes \`${outer}\` while it holds \`${inner}\`: two threads that run both can each hold one lock and wait forever for the other, a deadlock that no test reliably shows. Take nested locks in one order everywhere in the class (if any path takes a and then b, no path takes b and then a), or guard the state with one lock (\`synchronized(lock) { }\` or \`lock.withLock { }\`).`;
}

function sitesOf(file: KotlinFile, view: ClassIndex): Site[] {
  return (file.lockAcquisitions ?? []).flatMap((acquisition) => {
    const klass = enclosingClass(acquisition);
    if (klass === undefined) {
      return [];
    }
    const site = { file, view };
    const key = lockKey(acquisition.lock, { klass, locals: acquisition.locals, site });
    const { held } = heldLocks(acquisition, { klass, site });
    return key === undefined
      ? []
      : [{ acquisition, klass, key, held, member: memberName(unitOf(acquisition)) }];
  });
}

function inversion(entry: Site, sites: Site[]): { outer: string; other: string } | undefined {
  if (entry.held.includes(entry.key)) {
    return undefined;
  }
  for (const outer of entry.held) {
    if (outer === '?' || outer === entry.key) {
      continue;
    }
    const other = sites.find(
      (candidate) =>
        candidate.klass.qualified === entry.klass.qualified &&
        candidate.key === outer &&
        !candidate.held.includes(outer) &&
        candidate.held.includes(entry.key),
    );
    if (other !== undefined) {
      return { outer, other: other.member };
    }
  }
  return undefined;
}

export function lockOrderFindings(
  files: KotlinFile[],
  { finding, declaredIn = files }: RuleOptions,
): ReviewFinding[] {
  const view = classView(declaredIn);
  return files.flatMap((file) => {
    const sites = sitesOf(file, view);
    return sites.flatMap((entry) => {
      const found = inversion(entry, sites);
      if (found === undefined) {
        return [];
      }
      const pair = `${found.outer} -> ${entry.key}`;
      return [
        finding({
          rule: LOCK_ORDER_RULE,
          file: file.file,
          line: entry.acquisition.line,
          symbol: `${entry.klass.qualified}.${entry.member}: ${pair}`,
          message: message({ member: entry.member, inner: entry.key, ...found }),
        }),
      ];
    });
  });
}
