import { remembered } from './text-scan.mjs';

const IMPORT = /^[ \t]*import[ \t]+([\w.]+?)(\.\*)?(?:[ \t]+as[ \t]+(\w+))?[ \t]*$/gmu;
const PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/mu;
const TYPEALIAS = /\btypealias\s+(\w+)(?:\s*<[^>]*>)?\s*=\s*([\w.]+)/gu;

function simple(qualified) {
  return qualified.split('.').at(-1);
}

function readImports(scanned) {
  const imports = { explicit: new Map(), aliases: new Map(), stars: new Set() };
  for (const match of scanned.code.matchAll(IMPORT)) {
    const [, qualified, star, alias] = match;
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

export function importsOf(scanned) {
  return remembered(scanned, 'imports', () => readImports(scanned));
}

export function packageOf(scanned) {
  return PACKAGE.exec(scanned.code)?.[1] ?? '';
}

export function typeAliasesOf(scanned) {
  return new Map(
    [...scanned.code.matchAll(TYPEALIAS)].map((match) => [match[1], simple(match[2])]),
  );
}
