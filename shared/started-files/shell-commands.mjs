import path from 'node:path';

const SKIPPED_COMMANDS = new Set(['echo', 'printf']);
const UNRESOLVED = /[$`~*{}()<>]/u;
const SEPARATOR_CHARACTERS = new Set([';', '|', '&', '\n']);

function endWord(state) {
  if (state.word !== undefined) {
    state.words.push(state.word);
    state.word = undefined;
  }
}

function endSegment(state) {
  endWord(state);
  if (state.words.length > 0) {
    state.segments.push(state.words);
  }
  state.words = [];
}

function readQuoted(state, character) {
  if (character === state.quote) {
    state.quote = undefined;
    return;
  }
  state.word += character;
}

function readComment(state, character) {
  if (character === '\n') {
    state.comment = false;
    endSegment(state);
  }
}

function readCharacter(state, character) {
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

function splitWords(command) {
  const state = { segments: [], words: [], word: undefined, quote: undefined, comment: false };
  for (const character of command) {
    readCharacter(state, character);
  }
  endSegment(state);
  return state.segments;
}

function changedDirectory(directory, target) {
  if (directory === undefined || target === undefined || UNRESOLVED.test(target)) {
    return undefined;
  }
  return path.posix.isAbsolute(target)
    ? undefined
    : path.posix.normalize(path.posix.join(directory, target));
}

function nestedItems(words, directory) {
  return words
    .slice(1)
    .filter((entry) => /\s/u.test(entry))
    .map((nested) => ({ nested, directory }));
}

function commandLevel(command, baseDirectory = '') {
  const items = [];
  let directory = baseDirectory;
  for (const words of splitWords(command)) {
    if (words[0] === 'cd') {
      directory = changedDirectory(directory, words[1]);
    } else if (!SKIPPED_COMMANDS.has(words[0])) {
      items.push({ tokens: words, directory }, ...nestedItems(words, directory));
    }
  }
  return items;
}

function expandNested(items) {
  return items.flatMap((item) =>
    item.nested === undefined ? [item] : commandLevel(item.nested, item.directory),
  );
}

export function shellCommands(command, baseDirectory = '') {
  return Array.from(command)
    .reduce((items) => expandNested(items), commandLevel(command, baseDirectory))
    .filter(({ directory }) => directory !== undefined);
}
