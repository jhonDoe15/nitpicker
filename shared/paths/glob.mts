import { byText } from '../text-order/by-text.mts';

const LINE_TERMINATORS = new Set(['\n', '\r', ' ', ' ']);

type Test = (character: string) => boolean;
type OneToken = { kind: 'one'; test: Test; length: number; source: string };
type RepeatToken = { kind: 'repeat'; test: Test; length: number; source: string };
type DirectoriesToken = { kind: 'directories'; length: number; source: string };
type Token = OneToken | RepeatToken | DirectoriesToken;
type Group = { kind: 'group'; branches: GlobNode[][] };
type GlobNode = Token | Group;
type State = { split: number[] } | { test: Test; next: number } | { match: true };
type Task = { sequence: GlobNode[]; next: number; group: number; slot: number };
type Program = { states: State[]; tasks: Task[] };
type AutomatonState = { members: number[]; accepts: boolean; moves: Map<string, AutomatonState> };
type Automaton = { states: State[]; known: Map<string, AutomatonState> };

function isNotSlash(character: string): boolean {
  return character !== '/';
}

function isNotLineTerminator(character: string): boolean {
  return !LINE_TERMINATORS.has(character);
}

function last<Item>(list: Item[]): Item {
  const item = list.at(-1);
  if (item === undefined) {
    throw new Error('Glob parser state is empty');
  }
  return item;
}

function stateAt(states: State[], index: number): State {
  const state = states[index];
  if (state === undefined) {
    throw new Error(`Glob state ${String(index)} does not exist`);
  }
  return state;
}

function splitOf(states: State[], index: number): number[] {
  const state = stateAt(states, index);
  if ('split' in state) {
    return state.split;
  }
  throw new Error(`Glob state ${String(index)} does not split`);
}

function setSplit(states: State[], index: number, split: number[]): void {
  states[index] = { split };
}

function globToken(glob: string, index: number): Token {
  const character = glob.charAt(index);
  if (character === '\\' && index + 1 < glob.length) {
    const literal = glob.charAt(index + 1);
    return {
      kind: 'one',
      test: (other: string) => other === literal,
      length: 2,
      source: escapeRegExp(literal),
    };
  }
  if (character === '*' && glob[index + 1] === '*') {
    return glob[index + 2] === '/'
      ? { kind: 'directories', length: 3, source: '(?:|.*/)' }
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
    test: (other: string) => other === character,
    length: 1,
    source: escapeRegExp(character),
  };
}

function sourceToken(
  glob: string,
  index: number,
  depth: number,
): { source: string; length: number; depth: number } {
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

export function globToRegExpSource(glob: string): string {
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

function parseBrace(open: Group[], character: string | undefined): boolean {
  const group = last(open);
  if (character === '{') {
    const child: Group = { kind: 'group', branches: [[]] };
    last(group.branches).push(child);
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

function parseAt(open: Group[], glob: string, index: number): number {
  if (parseBrace(open, glob[index])) {
    return 1;
  }
  const token = globToken(glob, index);
  last(last(open).branches).push(token);
  return token.length;
}

function parseGlob(glob: string): GlobNode[] {
  const root: Group = { kind: 'group', branches: [[]] };
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
  return root.branches[0] ?? [];
}

function compileGroup(
  { states, tasks }: Program,
  node: { readonly branches: GlobNode[][] },
  next: number,
): number {
  const group = states.push({ split: [] }) - 1;
  for (const [slot, sequence] of node.branches.entries()) {
    tasks.push({ sequence, next, group, slot });
  }
  return group;
}

function compileNode(program: Program, node: GlobNode, next: number): number {
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
    setSplit(states, loop, [states.push({ test: node.test, next: loop }) - 1, next]);
    return loop;
  }
  const slash = states.push({ test: (character: string) => character === '/', next }) - 1;
  const loop = states.push({ split: [] }) - 1;
  setSplit(states, loop, [states.push({ test: isNotLineTerminator, next: loop }) - 1, slash]);
  return states.push({ split: [next, loop] }) - 1;
}

function compileSequences(states: State[], nodes: GlobNode[]): number {
  const program: Program = { states, tasks: [] };
  const start = compileGroup(program, { branches: [nodes] }, 0);
  for (const { sequence, next, group, slot } of program.tasks) {
    splitOf(states, group)[slot] = sequence.reduceRight(
      (after: number, node: GlobNode) => compileNode(program, node, after),
      next,
    );
  }
  return start;
}

function closure(states: State[], starts: number[]): number[] {
  const reached = new Set<number>();
  const pending = [...starts];
  for (const index of pending) {
    if (reached.has(index)) {
      continue;
    }
    reached.add(index);
    const state = stateAt(states, index);
    for (const next of 'split' in state ? state.split : []) {
      pending.push(next);
    }
  }
  return [...reached]
    .filter((index) => !('split' in stateAt(states, index)))
    .toSorted((left, right) => byText(String(left), String(right)));
}

function automatonState(automaton: Automaton, members: number[]): AutomatonState {
  const key = members.join(',');
  const known = automaton.known.get(key);
  if (known !== undefined) {
    return known;
  }
  const created = {
    members,
    accepts: members.includes(0),
    moves: new Map<string, AutomatonState>(),
  };
  automaton.known.set(key, created);
  return created;
}

function move(automaton: Automaton, current: AutomatonState, character: string): AutomatonState {
  const known = current.moves.get(character);
  if (known !== undefined) {
    return known;
  }
  const { states } = automaton;
  const reached = current.members.flatMap((index) => {
    const state = stateAt(states, index);
    return 'test' in state && state.test(character) ? [state.next] : [];
  });
  const reachedState = automatonState(automaton, closure(states, reached));
  current.moves.set(character, reachedState);
  return reachedState;
}

function compileGlob(glob: string): (value: string) => boolean {
  const states: State[] = [{ match: true }];
  const start = compileSequences(states, parseGlob(glob));
  const automaton: Automaton = { states, known: new Map() };
  const initial = automatonState(automaton, closure(states, [start]));
  return (value: string) => {
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

function compiledOnce<Value>(compile: (glob: string) => Value): (glob: string) => Value {
  const compiled = new Map<string, Value>();
  return (glob: string) => {
    const known = compiled.get(glob);
    if (known !== undefined) {
      return known;
    }
    const made = compile(glob);
    compiled.set(glob, made);
    return made;
  };
}

export const globMatcher: (glob: string) => { test: (value: string) => boolean } = compiledOnce(
  (glob: string) => ({ test: compileGlob(glob) }),
);

export function globsMatcher(globs: readonly string[] = []): (file: string) => boolean {
  const matchers = globs.map((glob) => globMatcher(glob));
  return (file: string) => matchers.some((matcher) => matcher.test(file));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[$()*+.?[\\\]^{|}]/g, (match) => `\\${match}`);
}
