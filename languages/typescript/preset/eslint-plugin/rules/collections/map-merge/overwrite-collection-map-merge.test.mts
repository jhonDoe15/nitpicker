import { typescriptRuleTester } from '../../../test-support/rule-tester.mts';
import { rule } from './overwrite-collection-map-merge.mts';

const tester = typescriptRuleTester();

const OVERWRITE = { messageId: 'overwriteCollectionMapMerge' };

tester.run('overwrite-collection-map-merge', rule, {
  valid: [
    {
      filename: 'src/merge.mts',
      code: `
        export function copyOne(part: Map<string, Set<string>>) {
          const all = new Map<string, Set<string>>();
          for (const [k, v] of part) {
            all.set(k, v);
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeCounts(parts: Map<string, number>[]) {
          const all = new Map<string, number>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeStrings(parts: Record<string, string>[]) {
          const all: Record<string, string> = {};
          for (const part of parts) {
            Object.assign(all, part);
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeNumbers(parts: Record<string, number>[]) {
          let all: Record<string, number> = {};
          for (const part of parts) {
            all = { ...all, ...part };
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeSets(parts: Map<string, Set<string>>[]) {
          const all = new Map<string, Set<string>>();
          for (const part of parts) {
            for (const [k, v] of part) {
              const existing = all.get(k);
              if (existing !== undefined) {
                for (const item of v) {
                  existing.add(item);
                }
              } else {
                all.set(k, new Set(v));
              }
            }
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeArrays(parts: Map<string, string[]>[]) {
          const all = new Map<string, string[]>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, [...(all.get(k) ?? []), ...v]);
            }
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeWithHas(parts: Map<string, string[]>[]) {
          const all = new Map<string, string[]>();
          for (const part of parts) {
            for (const [k, v] of part) {
              if (!all.has(k)) {
                all.set(k, [...v]);
              }
            }
          }
          return all;
        }
      `,
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function separateMaps(parts: Map<string, Set<string>>[]) {
          const out: Map<string, Set<string>>[] = [];
          for (const part of parts) {
            const copy = new Map<string, Set<string>>();
            for (const [k, v] of part) {
              copy.set(k, v);
            }
            out.push(copy);
          }
          return out;
        }
      `,
    },
    {
      filename: 'src/merge.test.mts',
      code: `
        export function mergeSets(parts: Map<string, Set<string>>[]) {
          const all = new Map<string, Set<string>>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
    },
  ],
  invalid: [
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeSets(parts: Map<string, Set<string>>[]) {
          const all = new Map<string, Set<string>>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeArrays(parts: Map<string, string[]>[]) {
          const all = new Map<string, string[]>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeNestedMaps(parts: Map<string, Map<string, number>>[]) {
          const all = new Map<string, Map<string, number>>();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeInferred(parts: Map<string, Set<string>>[]) {
          const all = new Map();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, v);
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeForEach(parts: Map<string, string[]>[]) {
          const all = new Map<string, string[]>();
          parts.forEach((part) => {
            part.forEach((v, k) => {
              all.set(k, v);
            });
          });
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeObjectAssign(parts: Record<string, string[]>[]) {
          const all: Record<string, string[]> = {};
          for (const part of parts) {
            Object.assign(all, part);
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeSpread(parts: Record<string, Set<string>>[]) {
          let all: Record<string, Set<string>> = {};
          for (const part of parts) {
            all = { ...all, ...part };
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeRecordEntries(parts: Record<string, string[]>[]) {
          const all: Record<string, string[]> = {};
          for (const part of parts) {
            for (const [k, v] of Object.entries(part)) {
              all[k] = v;
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
    {
      filename: 'src/merge.mts',
      code: `
        export function mergeVisibleSet(parts: Iterable<Iterable<[string, Iterable<string>]>>) {
          const all = new Map();
          for (const part of parts) {
            for (const [k, v] of part) {
              all.set(k, new Set(v));
            }
          }
          return all;
        }
      `,
      errors: [OVERWRITE],
    },
  ],
});
