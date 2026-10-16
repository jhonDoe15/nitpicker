const MIN_STRINGS = 3;
const BLOCK_OPENER =
  /^\s*(?:async\s+)?(?:def|class|if|elif|else|for|while|try|except|finally|with|match|case)\b.*:\s*(?:#.*)?$/;
const COMMENT_OR_BLANK = /^\s*(?:#.*)?$/;
const OTHER_QUOTE = { "'": '"', '"': "'" };

function closingTriple(text, from, quote) {
  let index = from;
  while (index < text.length) {
    if (text[index] === '\\') {
      index += 2;
    } else if (text.startsWith(quote.repeat(3), index)) {
      return index + 3;
    } else {
      index += 1;
    }
  }
  return text.length;
}

function closingQuote(text, from, quote) {
  let index = from;
  while (index < text.length && text[index] !== '\n') {
    if (text[index] === '\\') {
      index += 2;
    } else if (text[index] === quote) {
      return index;
    } else {
      index += 1;
    }
  }
  return -1;
}

function isEvidence(content, quote) {
  return !content.includes(OTHER_QUOTE[quote]) && !content.includes(`\\${quote}`);
}

export function stringQuotes(text) {
  const counts = { "'": 0, '"': 0 };
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (character === '#') {
      const end = text.indexOf('\n', index);
      index = end === -1 ? text.length : end;
    } else if (character in OTHER_QUOTE && text.startsWith(character.repeat(3), index)) {
      index = closingTriple(text, index + 3, character);
    } else if (character in OTHER_QUOTE) {
      const end = closingQuote(text, index + 1, character);
      if (end !== -1 && isEvidence(text.slice(index + 1, end), character)) {
        counts[character] += 1;
      }
      index = end === -1 ? index + 1 : end + 1;
    } else {
      index += 1;
    }
  }
  const total = counts["'"] + counts['"'];
  if (total < MIN_STRINGS || counts["'"] === counts['"']) {
    return undefined;
  }
  return counts["'"] > counts['"'] ? 'single' : 'double';
}

export function indentationWidth(text) {
  const lines = text.split(/\r?\n/);
  if (lines.some((line) => line.startsWith('\t'))) {
    return undefined;
  }
  const code = lines.filter((line) => !COMMENT_OR_BLANK.test(line));
  const steps = new Map();
  for (const [index, line] of code.slice(0, -1).entries()) {
    if (BLOCK_OPENER.test(line)) {
      const step = leadingSpaces(code[index + 1]) - leadingSpaces(line);
      steps.set(step, (steps.get(step) ?? 0) + 1);
    }
  }
  const two = steps.get(2) ?? 0;
  const four = steps.get(4) ?? 0;
  if (two === four) {
    return undefined;
  }
  return two > four ? '2' : '4';
}

function leadingSpaces(line) {
  return line.length - line.trimStart().length;
}
