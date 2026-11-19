import { groupOf } from '../typed/indexing.mts';
import type { Imports, TestScanned } from '../typed/discovery-types.mts';
import { remembered } from './text-scan.mts';

const IMPORT = /^[ \t]*import[ \t]+([\w.]+?)(\.\*)?(?:[ \t]+as[ \t]+(\w+))?[ \t]*$/gmu;
const PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/mu;
const TYPEALIAS = /\btypealias\s+(\w+)(?:\s*<[^>]*>)?\s*=\s*([\w.]+)/gu;

function simple(qualified: string): string {
  return qualified.split('.').at(-1) ?? '';
}

function readImports(scanned: TestScanned): Imports {
  const imports: Imports = { explicit: new Map(), aliases: new Map(), stars: new Set() };
  for (const match of scanned.code.matchAll(IMPORT)) {
    const qualified = groupOf(match, 1);
    const star = match[2];
    const alias = match[3];
    if (star !== undefined) {
      imports.stars.add(qualified);
    } else if (alias === undefined) {
      imports.explicit.set(simple(qualified), qualified);
    } else {
      imports.aliases.set(alias, { target: simple(qualified), qualified });
    }
  }
  return imports;
}

export function importsOf(scanned: TestScanned): Imports {
  return remembered(scanned, 'imports', () => readImports(scanned));
}

export function packageOf(scanned: TestScanned): string {
  return PACKAGE.exec(scanned.code)?.[1] ?? '';
}

export function typeAliasesOf(scanned: TestScanned): Map<string, string> {
  return new Map(
    [...scanned.code.matchAll(TYPEALIAS)].map((match) => [
      groupOf(match, 1),
      simple(groupOf(match, 2)),
    ]),
  );
}
