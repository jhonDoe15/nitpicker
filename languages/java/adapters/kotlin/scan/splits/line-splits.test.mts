import { describeBodyCases } from '../typed/body-cases.mts';
import type { Check, Ruled } from '../typed/typed-scan.mts';
import { newlineOnlyLineSplits as untypedLineSplits } from './line-splits.mjs';

const newlineOnlyLineSplits: Check<Ruled> = untypedLineSplits;

describeBodyCases({
  title: 'newlineOnlyLineSplits',
  check: newlineOnlyLineSplits,
  header: `fun load(file: File) {`,
  reports: [
    ['a split of readText', '    val lines = file.readText().split("\\n")'],
    ['a split of a trimmed read', '    val lines = file.readText().trim().split("\\n")'],
    ['a split of Files.readString', '    val lines = Files.readString(path).split("\\n")'],
    ['indexOf of a read', '    val end = file.readText().indexOf("\\n")'],
    ['a named read', '    val text = file.readText()\n    val lines = text.split("\\n")'],
    [
      'a named read with a charset',
      '    val text = file.readText(Charsets.UTF_8)\n    val end = text.lastIndexOf("\\n")',
    ],
  ],
  clean: [
    ['lines()', '    val lines = file.readText().lines()'],
    ['a generated text', '    val lines = generated.split("\\n")'],
    ['a regex split', '    val lines = file.readText().split(Regex("\\\\r?\\\\n"))'],
    ['another separator', '    val parts = file.readText().split(",")'],
    ['a named text from elsewhere', '    val text = input()\n    val lines = text.split("\\n")'],
    [
      'a normalised text',
      '    val text = file.readText().replace("\\r\\n", "\\n")\n    val lines = text.split("\\n")',
    ],
    ['a comment', '    // file.readText().split("\\n")'],
  ],
});
