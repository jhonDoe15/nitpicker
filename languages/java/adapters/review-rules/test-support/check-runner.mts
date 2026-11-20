import { parseSource } from '../max-value-sums/source/source-file.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';

type Options = { readonly kotlin: boolean };

export function checkRunner<Row, Result>(options: {
  check: { find: (source: SourceFile) => Row[] };
  pick: (row: Row) => Result;
}): (body: string, variant?: Options) => Result[] {
  return function run(body, variant = { kotlin: false }) {
    const { kotlin } = variant;
    const file = kotlin ? 'A.kt' : 'A.java';
    return options.check
      .find(parseSource(`class A {\n${body}\n}\n`, { file, kotlin }))
      .map(options.pick);
  };
}

type Found = { readonly line: number; readonly name: string };
type Check = { find: (source: SourceFile) => Found[] };

export function namesOf(check: Check): (body: string, variant?: Options) => string[] {
  return checkRunner({ check, pick: ({ name }) => name });
}

export function linesOf(check: Check): (body: string, variant?: Options) => number[] {
  return checkRunner({ check, pick: ({ line }) => line });
}
