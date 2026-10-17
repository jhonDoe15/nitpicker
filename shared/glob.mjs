// Glob matching shared by every language: `**`, `*`, `?` and `{a,b}` over `/` paths.

const LINE_TERMINATORS = new Set(['\n', '\r', ' ', ' ']);

/** Translates one glob (`**`, `*`, `?`, `{a,b}`) into a regular expression source for `/` paths. */
export function globToRegExpSource(glob) {
  let source = '';
  let braceDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') {
      const followedBySlash = glob[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (character === '*') {
      source += '[^/]*';
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '{') {
      braceDepth += 1;
      source += '(?:';
    } else if (character === '}' && braceDepth > 0) {
      braceDepth -= 1;
      source += ')';
    } else if (character === ',' && braceDepth > 0) {
      source += '|';
    } else {
      source += escapeRegExp(character);
    }
  }
  return `^(?:${source})$`;
}

function isNotSlash(character) {
  return character !== '/';
}

function isNotLineTerminator(character) {
  return !LINE_TERMINATORS.has(character);
}

function globToken(glob, index) {
  const character = glob[index];
  if (character === '*' && glob[index + 1] === '*') {
    return glob[index + 2] === '/'
      ? { kind: 'directories', length: 3 }
      : { kind: 'repeat', test: isNotLineTerminator, length: 2 };
  }
  if (character === '*') {
    return { kind: 'repeat', test: isNotSlash, length: 1 };
  }
  if (character === '?') {
    return { kind: 'one', test: isNotSlash, length: 1 };
  }
  return { kind: 'one', test: (other) => other === character, length: 1 };
}

function parseAt(open, glob, index) {
  const group = open.at(-1);
  const character = glob[index];
  if (character === '{') {
    const child = { kind: 'group', branches: [[]] };
    group.branches.at(-1).push(child);
    open.push(child);
    return 1;
  }
  if (character === '}' && open.length > 1) {
    open.pop();
    return 1;
  }
  if (character === ',' && open.length > 1) {
    group.branches.push([]);
    return 1;
  }
  const token = globToken(glob, index);
  group.branches.at(-1).push(token);
  return token.length;
}

function parseGlob(glob) {
  const root = { branches: [[]] };
  const open = [root];
  let next = 0;
  for (const index of glob.split('').keys()) {
    if (index >= next) {
      next = index + parseAt(open, glob, index);
    }
  }
  if (open.length > 1) {
    throw new SyntaxError(`Invalid glob ${JSON.stringify(glob)}: a "{" is never closed`);
  }
  return root.branches[0];
}

function compileNode(states, node, next) {
  if (node.kind === 'group') {
    states.push({ split: node.branches.map((branch) => compileSequence(states, branch, next)) });
    return states.length - 1;
  }
  if (node.kind === 'one') {
    states.push({ test: node.test, next });
    return states.length - 1;
  }
  if (node.kind === 'repeat') {
    const loop = states.push({ split: [] }) - 1;
    states[loop].split = [states.push({ test: node.test, next: loop }) - 1, next];
    return loop;
  }
  const slash = states.push({ test: (character) => character === '/', next }) - 1;
  const loop = states.push({ split: [] }) - 1;
  states[loop].split = [states.push({ test: isNotLineTerminator, next: loop }) - 1, slash];
  return states.push({ split: [next, loop] }) - 1;
}

function compileSequence(states, sequence, next) {
  return sequence.reduceRight((after, node) => compileNode(states, node, after), next);
}

function closure(states, starts) {
  const reached = new Set();
  const pending = [...starts];
  for (const index of pending) {
    if (!reached.has(index)) {
      reached.add(index);
      pending.push(...(states[index].split ?? []));
    }
  }
  return [...reached].filter((index) => states[index].split === undefined).toSorted();
}

function automatonState(automaton, members) {
  const key = members.join(',');
  if (!automaton.known.has(key)) {
    automaton.known.set(key, { members, accepts: members.includes(0), moves: new Map() });
  }
  return automaton.known.get(key);
}

function move(automaton, current, character) {
  if (!current.moves.has(character)) {
    const { states } = automaton;
    const reached = current.members
      .filter((index) => states[index].test?.(character) === true)
      .map((index) => states[index].next);
    current.moves.set(character, automatonState(automaton, closure(states, reached)));
  }
  return current.moves.get(character);
}

function compileGlob(glob) {
  const states = [{ match: true }];
  const start = compileSequence(states, parseGlob(glob), 0);
  const automaton = { states, known: new Map() };
  const initial = automatonState(automaton, closure(states, [start]));
  return (value) => {
    let current = initial;
    for (const character of value.split('')) {
      current = move(automaton, current, character);
      if (current.members.length === 0) {
        return false;
      }
    }
    return current.accepts;
  };
}

export function globMatcher(glob) {
  return { test: compileGlob(glob) };
}

export function escapeRegExp(value) {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}
