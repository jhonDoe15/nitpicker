const LINE_RULE = 'NewlineOnlyLineSplit';

const LINE_MESSAGES = {
  [LINE_RULE]:
    'Split on every line terminator with `text.lines()` or `split(Regex("\\\\r\\\\n|\\\\r|\\\\n"))`, or ' +
    'read the file with `readLines()` or `useLines`. Splitting file text on `"\\n"` only leaves a ' +
    'carriage return on every line of a CRLF file, so comparisons and regular expressions are off, and ' +
    'text that uses a lone carriage return is not split at all. Text the program generated itself is ' +
    'fine.',
};

const NEWLINE_CALL = /\.\s*(?:split|indexOf|lastIndexOf)\s*\(\s*" *"\s*\)/g;
const NEWLINE_ARGUMENT = /^\.\s*(?:split|indexOf|lastIndexOf)\s*\(\s*"\\n"\s*\)$/;
const BYTES_TO_TEXT = String.raw`readBytes\s*\(\s*\)\s*\.\s*decodeToString`;
const FILE_READ = String.raw`(?:readText|readString|${BYTES_TO_TEXT}|readAllBytes)\s*\([^()]*\)`;
const TRIMS = String.raw`(?:\s*\??\.\s*(?:trim|trimEnd|trimStart)\s*\(\s*\))*`;
const READ_RECEIVER = new RegExp(String.raw`${FILE_READ}${TRIMS}\s*$`);
const NAMED_READ = new RegExp(
  String.raw`(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::\s*String\s*)?=\s*(?:[^\s][^\n]*?)?` +
    String.raw`${FILE_READ}${TRIMS}\s*(?:\n|;|$)`,
  'g',
);
const NAME_BEFORE = /([A-Za-z_]\w*)\s*(?:\?\s*)?$/;
const NAME_WINDOW = 200;
const LINE_ENDING_AWARE = /\\r|\\u2028|\\R|lines\(\)/;

export function newlineOnlyLineSplits(scanned) {
  const { code, source } = scanned;
  if (LINE_ENDING_AWARE.test(source)) {
    return [];
  }
  const fileTexts = new Set([...code.matchAll(NAMED_READ)].map((match) => match[1]));
  return [...code.matchAll(NEWLINE_CALL)].flatMap((match) => {
    const end = match.index + match[0].length;
    const before = code.slice(Math.max(0, match.index - NAME_WINDOW), match.index);
    const named = NAME_BEFORE.exec(before)?.[1];
    return NEWLINE_ARGUMENT.test(source.slice(match.index, end)) &&
      (READ_RECEIVER.test(before) || (named !== undefined && fileTexts.has(named)))
      ? [{ rule: LINE_RULE, offset: match.index }]
      : [];
  });
}

export const kotlinSourceRules = { messages: LINE_MESSAGES, main: [newlineOnlyLineSplits] };
