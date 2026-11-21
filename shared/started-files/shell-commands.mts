import path from 'node:path';
import { appendAll } from '../lists/lists.mts';

const SKIPPED_COMMANDS = new Set(['echo', 'printf']);
const UNRESOLVED = /[$`~*{}()<>]/u;
const SEPARATOR_CHARACTERS = new Set([';', '|', '&', '\n']);

type State = {
  segments: string[][];
  words: string[];
  word: string | undefined;
  quote: string | undefined;
  comment: boolean;
};
type Command = { tokens: string[]; directory: string | undefined };
type Nested = { nested: string; directory: string | undefined };
type Resolved = { tokens: string[]; directory: string };

function endWord(state: State): void {
  if (state.word !== undefined) {
    state.words.push(state.word);
    state.word = undefined;
  }
}

function endSegment(state: State): void {
  endWord(state);
  if (state.words.length > 0) {
    state.segments.push(state.words);
  }
  state.words = [];
}

function readQuoted(state: State, character: string): void {
  if (character === state.quote) {
    state.quote = undefined;
    return;
  }
  state.word = (state.word ?? '') + character;
}

function readComment(state: State, character: string): void {
  if (character === '\n') {
    state.comment = false;
    endSegment(state);
  }
}

function readCharacter(state: State, character: string): void {
  if (state.comment) {
    readComment(state, character);
  } else if (state.quote !== undefined) {
    readQuoted(state, character);
  } else if (character === '"' || character === "'") {
    state.quote = character;
    state.word ??= '';
  } else if (character === '#' && state.word === undefined) {
    state.comment = true;
  } else if (SEPARATOR_CHARACTERS.has(character)) {
    endSegment(state);
  } else if (/\s/u.test(character)) {
    endWord(state);
  } else {
    state.word = (state.word ?? '') + character;
  }
}

function splitWords(command: string): string[][] {
  const state: State = {
    segments: [],
    words: [],
    word: undefined,
    quote: undefined,
    comment: false,
  };
  for (const character of command) {
    readCharacter(state, character);
  }
  endSegment(state);
  return state.segments;
}

function changedDirectory(
  directory: string | undefined,
  target: string | undefined,
): string | undefined {
  if (directory === undefined || target === undefined || UNRESOLVED.test(target)) {
    return undefined;
  }
  return path.posix.isAbsolute(target)
    ? undefined
    : path.posix.normalize(path.posix.join(directory, target));
}

function nestedItems(words: string[], directory: string | undefined): Nested[] {
  return words
    .slice(1)
    .filter((entry) => /\s/u.test(entry))
    .map((nested) => ({ nested, directory }));
}

function commandLevel(command: string, baseDirectory = ''): (Command | Nested)[] {
  const items: (Command | Nested)[] = [];
  let directory: string | undefined = baseDirectory;
  for (const words of splitWords(command)) {
    if (words[0] === 'cd') {
      directory = changedDirectory(directory, words[1]);
    } else if (!SKIPPED_COMMANDS.has(words[0] ?? '')) {
      appendAll(items, [{ tokens: words, directory }, ...nestedItems(words, directory)]);
    }
  }
  return items;
}

function expandNested(items: readonly (Command | Nested)[]): (Command | Nested)[] {
  return items.flatMap((item) =>
    'nested' in item ? commandLevel(item.nested, item.directory) : [item],
  );
}

function isResolved(item: Command | Nested): item is Resolved {
  return 'tokens' in item && item.directory !== undefined;
}

export function shellCommands(command: string, baseDirectory = ''): Resolved[] {
  return Array.from(command)
    .reduce((items) => expandNested(items), commandLevel(command, baseDirectory))
    .filter(isResolved);
}
