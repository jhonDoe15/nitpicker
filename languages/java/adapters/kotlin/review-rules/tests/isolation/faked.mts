import type { TestScanned } from '../typed/discovery-types.mts';
import { closeOf, remembered } from '../discovery/text-scan.mts';

const STATIC_MOCK = /\b(?:mockkStatic|mockStatic|mockkObject|mockkConstructor)\s*\(/gu;
const NAME = /[A-Za-z_]\w*/gu;

function mockedStatics(scanned: TestScanned): Set<string> {
  return remembered(scanned, 'mocked-statics', () => {
    const names = new Set<string>();
    for (const match of scanned.code.matchAll(STATIC_MOCK)) {
      const open = match.index + match[0].length - 1;
      const args = scanned.code.slice(open + 1, closeOf(scanned, open));
      for (const name of args.matchAll(NAME)) {
        names.add(name[0]);
      }
    }
    return names;
  });
}

export function mocksAny(scanned: TestScanned, types: string[]): boolean {
  const names = mockedStatics(scanned);
  return types.some((type) => names.has(type));
}
