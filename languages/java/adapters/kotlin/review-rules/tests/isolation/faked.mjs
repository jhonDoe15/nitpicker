import { closeOf, remembered } from '../discovery/text-scan.mjs';

const STATIC_MOCK = /\b(?:mockkStatic|mockStatic|mockkObject|mockkConstructor)\s*\(/gu;
const NAME = /[A-Za-z_]\w*/gu;

function mockedStatics(scanned) {
  return remembered(scanned, 'mocked-statics', () => {
    const names = new Set();
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

export function mocksAny(scanned, types) {
  const names = mockedStatics(scanned);
  return types.some((type) => names.has(type));
}
