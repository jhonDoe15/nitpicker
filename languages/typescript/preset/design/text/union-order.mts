const OPENERS = '([{';
const CLOSERS = ')]}';
const QUOTES = '"\'';
const ESCAPED_UNIT = /^\\u[0-9A-Fa-f]{4}/u;
const FIRST_NOT_ASCII = 0x80;
const HEX = 16;
const UNIT_LENGTH = 6;
const CUTS = [' is ', ' extends ', ' in ', ' as ', '=>', ';', ',', '?', ':'];

type Level = { readonly text: string; readonly end: number };

function quotedEnd(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length && text[index] !== text[start]) {
    index += text[index] === '\\' ? 2 : 1;
  }
  return Math.min(index + 1, text.length);
}

function withoutOuterSpaces(member: string): string {
  return member.replaceAll(/^ +| +$/gu, '');
}

function sortedMembers(members: readonly string[]): string {
  return members.map(withoutOuterSpaces).toSorted().join(' | ');
}

function sortedEntries(entries: readonly string[], sorted: boolean): string {
  const listed = sorted ? entries.map(withoutOuterSpaces).toSorted() : entries;
  return listed.map((entry) => `${entry};`).join('');
}

function withLoneSurrogatesEscaped(text: string): string {
  return text.replaceAll(
    /\p{Surrogate}/gu,
    (unit) => `\\u${unit.charCodeAt(0).toString(HEX).toUpperCase().padStart(4, '0')}`,
  );
}

function escapedUnit(text: string, index: number): string | undefined {
  const [written] = ESCAPED_UNIT.exec(text.slice(index, index + UNIT_LENGTH)) ?? [];
  const unit = written === undefined ? 0 : Number.parseInt(written.slice(2), HEX);
  return unit >= FIRST_NOT_ASCII ? String.fromCharCode(unit) : undefined;
}

function templateFrom(text: string, start: number): Level {
  let result = '`';
  let units = '';
  let index = start + 1;
  while (index < text.length) {
    const unit = escapedUnit(text, index);
    const char = text.charAt(index);
    if (unit !== undefined) {
      units += unit;
      index += UNIT_LENGTH;
    } else {
      result += withLoneSurrogatesEscaped(units);
      units = '';
      if (char === '`') {
        return { text: result + char, end: index + 1 };
      }
      if (char === '\\') {
        result += text.slice(index, index + 2);
        index += 2;
      } else if (text.startsWith('${', index)) {
        const inner = levelFrom(text, index + 2);
        result += `\${${inner.text}${text.charAt(inner.end)}`;
        index = inner.end + 1;
      } else {
        result += char;
        index += 1;
      }
    }
  }
  return { text: result + withLoneSurrogatesEscaped(units), end: text.length };
}

function levelFrom(text: string, start: number, sorted = false): Level {
  const entries: string[] = [];
  let done = '';
  let members: string[] = [];
  let member = '';
  let index = start;
  while (index < text.length && !CLOSERS.includes(text.charAt(index))) {
    const char = text.charAt(index);
    const cut = CUTS.find((candidate) => text.startsWith(candidate, index));
    if (char === '`') {
      const written = templateFrom(text, index);
      member += written.text;
      index = written.end;
    } else if (QUOTES.includes(char)) {
      const end = quotedEnd(text, index);
      member += withLoneSurrogatesEscaped(text.slice(index, end));
      index = end;
    } else if (OPENERS.includes(char)) {
      const inner = levelFrom(text, index + 1, char === '{');
      member += char + inner.text + text.charAt(inner.end);
      index = inner.end + 1;
    } else if (cut !== undefined) {
      done += sortedMembers([...members, member]) + (cut === ';' ? '' : cut);
      if (cut === ';') {
        entries.push(done);
        done = '';
      }
      members = [];
      member = '';
      index += cut.length;
    } else {
      if (char === '|') {
        members.push(member);
      }
      member = char === '|' ? '' : member + char;
      index += 1;
    }
  }
  const rest = done + sortedMembers([...members, member]);
  return { text: sortedEntries(entries, sorted) + rest, end: index };
}

export function withSortedUnions(text: string): string {
  let result = '';
  let index = 0;
  while (index <= text.length) {
    const level = levelFrom(text, index);
    result += level.text + text.charAt(level.end);
    index = level.end + 1;
  }
  return result;
}
