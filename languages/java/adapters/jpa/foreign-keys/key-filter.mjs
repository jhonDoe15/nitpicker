import { pathInside } from '../../../../../shared/filesystem.mjs';
import { classIndex, readSource, superclassOf } from '../jpa-source-filters.mjs';
import { foreignKeyGate } from './key-gate.mjs';

export const FOREIGN_KEY_RULE = 'JpaUnindexedForeignKey';

const MAX_ANCESTORS = 12;
const CLASS_NAME = /\bclass\s+(\w+)/gu;
const ENTITY = /@\s*(?:[\w.]*\.)?Entity\b/u;
const OWN_TABLES = /@\s*(?:[\w.]*\.)?Inheritance\s*\([^)]*\b(?:JOINED|TABLE_PER_CLASS)\b/u;

function ownerBefore(source, line) {
  const before = source
    .split('\n')
    .slice(0, Math.max(line - 1, 0))
    .join('\n');
  return [...before.matchAll(CLASS_NAME)].at(-1)?.[1];
}

function sharesParentTable(index, superclass) {
  const pending = [superclass];
  let entityParent = false;
  for (const name of pending) {
    const sources = (index.get(name) ?? []).map((file) => readSource(file) ?? '');
    if (sources.some((source) => OWN_TABLES.test(source))) {
      return false;
    }
    entityParent ||= sources.some((source) => ENTITY.test(source));
    const parent = sources.map((source) => superclassOf(source, name)).find(Boolean);
    if (parent !== undefined && pending.length < MAX_ANCESTORS) {
      pending.push(parent);
    }
  }
  return entityParent;
}

export function withUnindexedForeignKeys(findings, { projectRoot, sourceRoots = [] }) {
  const checks = foreignKeyGate(projectRoot);
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== FOREIGN_KEY_RULE) {
      return true;
    }
    if (!checks(finding.path)) {
      return false;
    }
    const file = pathInside(projectRoot, finding.path);
    const source = (file === undefined ? undefined : readSource(file)) ?? '';
    const owner = ownerBefore(source, finding.location?.line ?? 1);
    const superclass = owner === undefined ? undefined : superclassOf(source, owner);
    if (superclass === undefined) {
      return true;
    }
    index ??= classIndex(projectRoot, sourceRoots);
    return !sharesParentTable(index, superclass);
  });
}
