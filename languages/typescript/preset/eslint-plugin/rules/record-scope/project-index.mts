import type TypeScript from 'typescript';
import { isProjectSource } from '../program-rules/project-source-files.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';
import { fieldKey, isOwnerField, sitesIn, type Site } from './query-sites.mts';

type Counts = { total: number; readonly fields: Map<string, { name: string; count: number }> };
export type Convention = { readonly name: string; readonly share: number };

const MIN_QUERIES = 5;
const MIN_SHARE = 0.75;
const PERCENT = 100;
const TEST_FOLDERS =
  'test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__|migrations|seeds?';
const TEST_PATH = new RegExp(`(?:^|/)(?:${TEST_FOLDERS})/|\\.(?:test|spec|e2e-spec)\\.[^/]+$`, 'u');
const siteLists = new WeakMap<TypeScript.SourceFile, Site[]>();
const indexes = new WeakMap<TypeScript.Program, Map<string, Counts>>();

export function sitesOf(sourceFile: TypeScript.SourceFile): Site[] {
  return cachedValue(siteLists, sourceFile, () => sitesIn(sourceFile));
}

function addSite(index: Map<string, Counts>, site: Site): void {
  const counts: Counts = index.get(site.model) ?? { total: 0, fields: new Map() };
  counts.total += 1;
  for (const { name } of site.entries.filter((entry) => isOwnerField(entry.name))) {
    const known = counts.fields.get(fieldKey(name)) ?? { name, count: 0 };
    known.count += 1;
    counts.fields.set(fieldKey(name), known);
  }
  index.set(site.model, counts);
}

function buildIndex(program: TypeScript.Program): Map<string, Counts> {
  const index = new Map<string, Counts>();
  for (const file of program.getSourceFiles().filter((file) => isProjectSource(file, TEST_PATH))) {
    for (const site of sitesOf(file)) {
      addSite(index, site);
    }
  }
  return index;
}

export function conventionsOf(program: TypeScript.Program, model: string): Convention[] {
  const counts = cachedValue(indexes, program, buildIndex).get(model);
  if (counts === undefined || counts.total < MIN_QUERIES) {
    return [];
  }
  return [...counts.fields.values()]
    .filter(({ count }) => count / counts.total >= MIN_SHARE)
    .map(({ name, count }) => ({ name, share: Math.round((count / counts.total) * PERCENT) }));
}
