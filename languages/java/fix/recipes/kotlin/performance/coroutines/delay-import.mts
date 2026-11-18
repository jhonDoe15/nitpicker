import type { KotlinEdit, ScannedKotlin } from '../../shared/kotlin-scan.mts';

const IMPORT = /^[ \t]*import[ \t]+([\w.`*]+)((?:[^\w.`*\n][^\n]*)?)$/gmu;
const DELAY = 'kotlinx.coroutines.delay';
const COROUTINES = 'kotlinx.coroutines.';

type ImportLine = {
  readonly name: string;
  readonly rest: string;
  readonly start: number;
  readonly end: number;
};

function importLines(code: string): readonly ImportLine[] {
  return [...code.matchAll(IMPORT)].map((match) => ({
    name: match[1] ?? '',
    rest: match[2] ?? '',
    start: match.index,
    end: match.index + match[0].length,
  }));
}

export type DelayImport =
  { readonly usable: false } | { readonly usable: true; readonly edits: readonly KotlinEdit[] };

export function delayImport({ code }: ScannedKotlin): DelayImport {
  const imports = importLines(code);
  const coroutines = imports.some(({ name }) => name.startsWith(COROUTINES));
  const foreign = imports.some(
    ({ name, rest }) =>
      (name.endsWith('.delay') && name !== DELAY) ||
      (name === DELAY && /\bas\b/u.test(rest)) ||
      /\bas\s+delay\b/u.test(rest),
  );
  const own = /\b(?:fun|val|var)\s+(?:[\w.<>]+\.)?delay\b|[(,]\s*delay\s*:/u.test(code);
  if (!coroutines || foreign || own) {
    return { usable: false };
  }
  const present = imports.some(({ name, rest }) => name === DELAY && /^(?:\s*;)?\s*$/u.test(rest));
  const wildcard = imports.some(({ name }) => name === `${COROUTINES}*`);
  if (present || wildcard) {
    return { usable: true, edits: [] };
  }
  const later = imports.find(({ name }) => name > DELAY);
  const last = imports.at(-1);
  const edit =
    later === undefined
      ? { start: last?.end ?? 0, end: last?.end ?? 0, text: `\nimport ${DELAY}` }
      : { start: later.start, end: later.start, text: `import ${DELAY}\n` };
  return { usable: true, edits: [edit] };
}
