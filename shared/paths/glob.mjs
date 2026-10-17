const LINE_TERMINATORS = new Set(['\n', '\r', ' ', ' ']);

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
      ? { kind: 'directories', length: 3, source: '(?:.*/)?' }
      : { kind: 'repeat', test: isNotLineTerminator, length: 2, source: '.*' };
  }
  if (character === '*') {
    return { kind: 'repeat', test: isNotSlash, length: 1, source: '[^/]*' };
  }
  if (character === '?') {
    return { kind: 'one', test: isNotSlash, length: 1, source: '[^/]' };
  }
  return {
    kind: 'one',
    test: (other) => other === character,
    length: 1,
    source: escapeRegExp(character),
  };
}

function sourceToken(glob, index, depth) {
  const character = glob[index];
  if (character === '{') {
    return { source: '(?:', length: 1, depth: depth + 1 };
  }
  if (character === '}' && depth > 0) {
    return { source: ')', length: 1, depth: depth - 1 };
  }
  if (character === ',' && depth > 0) {
    return { source: '|', length: 1, depth };
  }
  const { source, length } = globToken(glob, index);
  return { source, length, depth };
}

/** Translates one glob (`**`, `*`, `?`, `{a,b}`) into a regular expression source for `/` paths. */
export function globToRegExpSource(glob) {
  let source = '';
  let depth = 0;
  let next = 0;
  for (const index of glob.split('').keys()) {
    if (index >= next) {
      const token = sourceToken(glob, index, depth);
      source += token.source;
      depth = token.depth;
      next = index + token.length;
    }
  }
  return `^(?:${source})$`;
}

function parseBrace(open, character) {
  const group = open.at(-1);
  if (character === '{') {
    const child = { kind: 'group', branches: [[]] };
    group.branches.at(-1).push(child);
    open.push(child);
    return true;
  }
  if (character === '}' && open.length > 1) {
    open.pop();
    return true;
  }
  if (character === ',' && open.length > 1) {
    group.branches.push([]);
    return true;
  }
  return false;
}

function parseAt(open, glob, index) {
  if (parseBrace(open, glob[index])) {
    return 1;
  }
  const token = globToken(glob, index);
  open.at(-1).branches.at(-1).push(token);
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

function compileGroup({ states, tasks }, node, next) {
  const group = states.push({ split: [] }) - 1;
  tasks.push(...node.branches.map((sequence, slot) => ({ sequence, next, group, slot })));
  return group;
}

function compileNode(program, node, next) {
  const { states } = program;
  if (node.kind === 'group') {
    return compileGroup(program, node, next);
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

function compileSequences(states, nodes) {
  const program = { states, tasks: [] };
  const start = compileGroup(program, { branches: [nodes] }, 0);
  for (const { sequence, next, group, slot } of program.tasks) {
    states[group].split[slot] = sequence.reduceRight(
      (after, node) => compileNode(program, node, after),
      next,
    );
  }
  return start;
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
  const start = compileSequences(states, parseGlob(glob));
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
