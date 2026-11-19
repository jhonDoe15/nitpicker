import { parse } from './source-runners.mts';

type Options = { readonly kotlin: boolean };

export function checkRunner<Row, Result>(options: {
  check: { find: (source: unknown) => Row[] };
  pick: (row: Row) => Result;
}): (body: string, variant?: Options) => Result[] {
  return function run(body, variant = { kotlin: false }) {
    const { kotlin } = variant;
    const file = kotlin ? 'A.kt' : 'A.java';
    return options.check.find(parse(`class A {\n${body}\n}\n`, { file, kotlin })).map(options.pick);
  };
}

type Found = { readonly line: number; readonly name: string };
type Check = { find: (source: unknown) => Found[] };

export function namesOf(check: Check): (body: string, variant?: Options) => string[] {
  return checkRunner({ check, pick: ({ name }) => name });
}

export function linesOf(check: Check): (body: string, variant?: Options) => number[] {
  return checkRunner({ check, pick: ({ line }) => line });
}
