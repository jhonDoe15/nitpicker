const STRING_QUOTE = '"';
const ESCAPE = '\\';

function skipLineComment(text, start) {
  const end = text.indexOf('\n', start);
  return end === -1 ? text.length : end;
}

function skipBlockComment(text, start) {
  const end = text.indexOf('*/', start + 2);
  return end === -1 ? text.length : end + 2;
}

function copyString(text, start) {
  let index = start + 1;
  while (index < text.length && text[index] !== STRING_QUOTE) {
    index += text[index] === ESCAPE ? 2 : 1;
  }
  return Math.min(index + 1, text.length);
}

function withoutComments(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    const pair = text.slice(index, index + 2);
    if (text[index] === STRING_QUOTE) {
      const end = copyString(text, index);
      output += text.slice(index, end);
      index = end;
    } else if (pair === '//') {
      index = skipLineComment(text, index);
    } else if (pair === '/*') {
      index = skipBlockComment(text, index);
    } else {
      output += text[index];
      index += 1;
    }
  }
  return output;
}

function withoutTrailingCommas(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    if (text[index] === STRING_QUOTE) {
      const end = copyString(text, index);
      output += text.slice(index, end);
      index = end;
    } else if (text[index] === ',' && /^,\s*[\]}]/.test(text.slice(index))) {
      index += 1;
    } else {
      output += text[index];
      index += 1;
    }
  }
  return output;
}

export function parseJsonc(text) {
  return JSON.parse(withoutTrailingCommas(withoutComments(text.replace(/^﻿/, ''))));
}
