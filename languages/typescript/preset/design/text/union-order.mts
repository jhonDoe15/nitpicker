const OPENERS = '([{';
const CLOSERS = ')]}';
const QUOTED: Readonly<Record<string, RegExp>> = {
  '"': /^"(?:\\[\s\S]?|[^"\\])*"?/u,
  "'": /^'(?:\\[\s\S]?|[^'\\])*'?/u,
};
const ESCAPED_UNIT = /^\\u[0-9A-Fa-f]{4}/u;
const FIRST_NOT_ASCII = 0x80;
const HEX = 16;
const UNIT_DIGITS = 4;
const UNIT_LENGTH = 6;
const CUTS = [' is ', ' extends ', ' in ', ' as ', '=>', ';', ',', '?', ':'];
const TEMPLATE_QUOTE = '`';
const SUBSTITUTION = `\${`;

type LevelFrame = {
  readonly kind: 'level';
  readonly open: string;
  readonly sorted: boolean;
  readonly entries: string[];
  done: string;
  members: string[];
  member: string;
};
type TemplateFrame = { readonly kind: 'template'; text: string; units: string };
type Frame = LevelFrame | TemplateFrame;
type Reading = { readonly frames: Frame[]; output: string; next: number };
type Place = { readonly text: string; readonly index: number };

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
    (unit) => `\\u${unit.charCodeAt(0).toString(HEX).toUpperCase().padStart(UNIT_DIGITS, '0')}`,
  );
}

function escapedUnit({ text, index }: Place): string | undefined {
  const [written] = ESCAPED_UNIT.exec(text.slice(index, index + UNIT_LENGTH)) ?? [];
  const unit = written === undefined ? 0 : Number.parseInt(written.slice(2), HEX);
  return unit >= FIRST_NOT_ASCII ? String.fromCharCode(unit) : undefined;
}

function levelFrame(open: string): LevelFrame {
  return {
    kind: 'level',
    open,
    sorted: open === '{',
    entries: [],
    done: '',
    members: [],
    member: '',
  };
}

function pieceOf(frame: Frame, closer: string): string {
  if (frame.kind === 'template') {
    return frame.text + withLoneSurrogatesEscaped(frame.units) + closer;
  }
  const rest = frame.done + sortedMembers([...frame.members, frame.member]);
  return frame.open + sortedEntries(frame.entries, frame.sorted) + rest + closer;
}

function appendTo(frame: Frame, piece: string): void {
  if (frame.kind === 'level') {
    frame.member += piece;
  } else {
    frame.text += piece;
  }
}

function close(reading: Reading, closer: string): void {
  const frame = reading.frames.pop();
  const parent = reading.frames.at(-1);
  if (frame === undefined) {
    return;
  }
  if (parent === undefined) {
    reading.output += pieceOf(frame, closer);
  } else {
    appendTo(parent, pieceOf(frame, closer));
  }
}

function endMember(frame: LevelFrame, cut: string): void {
  const written = frame.done + sortedMembers([...frame.members, frame.member]);
  if (cut === ';') {
    frame.entries.push(written);
  }
  frame.done = cut === ';' ? '' : written + cut;
  frame.members = [];
  frame.member = '';
}

function plainStep(frame: LevelFrame, { text, index }: Place): number {
  const cut = CUTS.find((candidate) => text.startsWith(candidate, index));
  const char = text.charAt(index);
  if (cut !== undefined) {
    endMember(frame, cut);
    return index + cut.length;
  }
  if (char === '|') {
    frame.members.push(frame.member);
  }
  frame.member = char === '|' ? '' : frame.member + char;
  return index + 1;
}

function levelStep(reading: Reading, frame: LevelFrame, place: Place): number {
  const { text, index } = place;
  const char = text.charAt(index);
  const [quoted] = QUOTED[char]?.exec(text.slice(index)) ?? [];
  if (CLOSERS.includes(char)) {
    close(reading, char);
    return index + 1;
  }
  if (char === TEMPLATE_QUOTE || OPENERS.includes(char)) {
    reading.frames.push(
      char === TEMPLATE_QUOTE ? { kind: 'template', text: char, units: '' } : levelFrame(char),
    );
    return index + 1;
  }
  if (quoted !== undefined) {
    frame.member += withLoneSurrogatesEscaped(quoted);
    return index + quoted.length;
  }
  return plainStep(frame, place);
}

function templateStep(reading: Reading, frame: TemplateFrame, place: Place): number {
  const { text, index } = place;
  const unit = escapedUnit(place);
  const char = text.charAt(index);
  if (unit !== undefined) {
    frame.units += unit;
    return index + UNIT_LENGTH;
  }
  frame.text += withLoneSurrogatesEscaped(frame.units);
  frame.units = '';
  if (char === TEMPLATE_QUOTE) {
    close(reading, char);
    return index + 1;
  }
  if (text.startsWith(SUBSTITUTION, index)) {
    reading.frames.push(levelFrame(SUBSTITUTION));
    return index + SUBSTITUTION.length;
  }
  frame.text += char === '\\' ? text.slice(index, index + 2) : char;
  return index + (char === '\\' ? 2 : 1);
}

function step(reading: Reading, place: Place): number {
  const top = reading.frames.at(-1) ?? levelFrame('');
  if (reading.frames.length === 0) {
    reading.frames.push(top);
  }
  return top.kind === 'level' ? levelStep(reading, top, place) : templateStep(reading, top, place);
}

export function withSortedUnions(text: string): string {
  const reading: Reading = { frames: [], output: '', next: 0 };
  for (const index of Array.from({ length: text.length }).keys()) {
    if (index >= reading.next) {
      reading.next = step(reading, { text, index });
    }
  }
  let piece = '';
  for (const frame of reading.frames.toReversed()) {
    appendTo(frame, piece);
    piece = pieceOf(frame, '');
  }
  return reading.output + piece;
}
