import { pathInside } from '../../../../../shared/filesystem.mjs';
import { blankLiterals } from '../../review-rules/java-sources.mjs';
import { classIndex, readSource, superclassOf } from '../jpa-source-filters.mjs';
import { FOREIGN_KEY_RULE, foreignKeyGate } from './key-gate.mjs';

const MAX_ANCESTORS = 12;
const CLASS_NAME = /\bclass\s+(\w+)/gu;
const ENTITY = /@\s*(?:[\w.]*\.)?Entity\b/u;
const OWN_TABLES = /@\s*(?:[\w.]*\.)?Inheritance\s*\([^)]*\b(?:JOINED|TABLE_PER_CLASS)\b/u;
const BRACES = { '{': 1, '}': -1 };

function depthsOf(text) {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of [...text].entries()) {
    depths[index + 1] = depths[index] + (BRACES[character] ?? 0);
  }
  return depths;
}

function offsetOfLine(text, line) {
  return text
    .split('\n')
    .slice(0, Math.max(line - 1, 0))
    .join('\n').length;
}

function ownerAt(source, line) {
  const text = blankLiterals(source);
  const depths = depthsOf(text);
  const offset = offsetOfLine(text, line);
  const owners = [...text.matchAll(CLASS_NAME)].filter((match) => {
    const open = text.indexOf('{', match.index);
    return (
      open >= 0 &&
      open < offset &&
      depths.slice(open + 1, offset + 1).every((depth) => depth > depths[open])
    );
  });
  return owners.at(-1)?.[1];
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

export function withUnindexedForeignKeys(findings, { projectRoot, sourceRoots = [], checks }) {
  const checked = checks ?? foreignKeyGate(projectRoot);
  let index;
  return findings.filter((finding) => {
    if (finding.tool !== 'pmd' || finding.rule !== FOREIGN_KEY_RULE) {
      return true;
    }
    if (!checked(finding.path)) {
      return false;
    }
    const file = pathInside(projectRoot, finding.path);
    const source = (file === undefined ? undefined : readSource(file)) ?? '';
    const owner = ownerAt(source, finding.location?.line ?? 1);
    const superclass = owner === undefined ? undefined : superclassOf(source, owner);
    if (superclass === undefined) {
      return true;
    }
    index ??= classIndex(projectRoot, sourceRoots);
    return !sharesParentTable(index, superclass);
  });
}
