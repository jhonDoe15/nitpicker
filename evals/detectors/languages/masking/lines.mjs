/**
 * The comments and masked text a scanner builds while it walks a source file. `chars` is the
 * source as UTF-16 units, so an index into it is an index into the text; the scanner blanks the
 * characters of comments and of string contents there and keeps every newline.
 */
export function createScan(text, options = {}) {
  const lineStarts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    lineStarts.push(index + 1);
  }
  return { text, chars: text.split(''), comments: [], lineStarts, ...options };
}

export function lineOf(scan, index) {
  let low = 0;
  let high = scan.lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (scan.lineStarts[middle] <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/** Replaces `[from, to)` with spaces, keeping newlines so lines and offsets stay put. */
export function blank(scan, from, to) {
  for (let index = from; index < to; index += 1) {
    if (scan.chars[index] !== '\n') scan.chars[index] = ' ';
  }
}

export function addComment(scan, { from, to, delimiter, closer = '' }) {
  scan.comments.push({
    text: scan.text.slice(from + delimiter.length, to - closer.length),
    line: lineOf(scan, from),
    block: closer !== '',
  });
  blank(scan, from, to);
}

/** Records the comment that starts with `delimiter` at `from` and runs to the end of the line. */
export function lineComment(scan, from, delimiter) {
  const newline = scan.text.indexOf('\n', from);
  const to = newline === -1 ? scan.text.length : newline;
  addComment(scan, { from, to, delimiter });
  return to;
}

export const finish = (scan) => ({ masked: scan.chars.join(''), comments: scan.comments });
