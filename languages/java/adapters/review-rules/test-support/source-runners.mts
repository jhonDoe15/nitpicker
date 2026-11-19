import { parseSource } from '../max-value-sums/source-file.mts';
import type { SourceFile } from '../max-value-sums/sum-types.mts';

export const parse: (text: string, options: { file: string; kotlin: boolean }) => SourceFile =
  parseSource;

type Variant = { readonly file: string; readonly wrap: (body: string) => string };

export function sourceRunners<Row, Result>(options: {
  find: (source: SourceFile) => Row[];
  pick: (row: Row) => Result;
  java: Variant;
  kotlin: Variant;
}): { java: (body: string) => Result[]; kotlin: (body: string) => Result[] } {
  function runner(variant: Variant, kotlin: boolean) {
    return function run(body: string): Result[] {
      return options
        .find(parse(variant.wrap(body), { file: variant.file, kotlin }))
        .map(options.pick);
    };
  }
  return { java: runner(options.java, false), kotlin: runner(options.kotlin, true) };
}
