const MODIFIER_WORDS =
  'public|private|protected|internal|override|open|abstract|final|data|sealed|enum|inner|value|suspend|inline|operator|infix|tailrec|external|const|lateinit|actual|expect|annotation|companion';
const MODIFIER_LINE = new RegExp(
  String.raw`^\s*(?:(?:@[\w.:]+(?:\([^)]*\))?|${MODIFIER_WORDS})\s*)+$`,
);
const ANNOTATION = /@(?:[a-z]+:)?(?:\w+\.)*([A-Za-z_]\w*)/g;
const LOOKBACK = 600;
const TYPE_HEADER_WINDOW = 300;
const CLASS_KEYWORD = /\b(?:class|object|interface)\b/g;
const TYPE_HEADER = /\b(?:class|object|interface)\b[^{};]*$/;
const DATA_MAPPED_MEMBER = new Set([
  'Column',
  'Field',
  'JsonProperty',
  'SerialName',
  'RequestParam',
  'RequestBody',
  'RequestHeader',
  'PathVariable',
]);
const DATA_MAPPED_CLASS = new Set([
  'Entity',
  'Embeddable',
  'MappedSuperclass',
  'Document',
  'Serializable',
]);

function lineStart(code, index) {
  return code.lastIndexOf('\n', index - 1) + 1;
}

function leadingText(code, index) {
  const start = lineStart(code, index);
  const from = Math.max(0, start - LOOKBACK);
  const above = code
    .slice(from, start)
    .split('\n')
    .slice(from === 0 ? 0 : 1, -1)
    .toReversed();
  const stop = above.findIndex((line) => !MODIFIER_LINE.test(line));
  const modifiers = stop === -1 ? above : above.slice(0, stop);
  return [code.slice(start, index), ...modifiers].join(' ');
}

export function hasModifier(code, index, word) {
  return new RegExp(String.raw`\b${word}\b`).test(leadingText(code, index));
}

function annotationNames(text) {
  return [...text.matchAll(ANNOTATION)].map((match) => match[1]);
}

export function isMappedText(text) {
  return annotationNames(text).some((name) => DATA_MAPPED_MEMBER.has(name));
}

export function isMappedMember(code, index) {
  return isMappedText(leadingText(code, index));
}

export function isMappedClass(code, index) {
  return annotationNames(leadingText(code, index)).some((name) => DATA_MAPPED_CLASS.has(name));
}

export function enclosingOpens(code) {
  const enclosing = new Int32Array(code.length + 1).fill(-1);
  const open = [];
  let cursor = 0;
  for (const { index, 0: brace } of code.matchAll(/[{}]/g)) {
    enclosing.fill(open.at(-1) ?? -1, cursor, index + 1);
    cursor = index + 1;
    if (brace === '{') {
      open.push(index);
    } else {
      open.pop();
    }
  }
  enclosing.fill(open.at(-1) ?? -1, cursor);
  return enclosing;
}

export function typeHeaderAt(code, open) {
  if (open === -1) {
    return undefined;
  }
  const from = Math.max(0, open - TYPE_HEADER_WINDOW);
  const window = code.slice(from, open);
  if (!TYPE_HEADER.test(window)) {
    return undefined;
  }
  const keywords = [...window.matchAll(CLASS_KEYWORD)];
  return keywords.length === 0 ? undefined : from + keywords.at(-1).index;
}

export function isMemberLevel(code, enclosing, offset) {
  const open = enclosing[offset];
  return open === -1 || typeHeaderAt(code, open) !== undefined;
}
