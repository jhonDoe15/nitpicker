import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONTINUATION = /\\\r?\n/g;
const INCLUDE = /^(?:-r|--requirement)(?:\s+|=)(\S+)$/;
const CONSTRAINT = /^(?:-c|--constraint)(?:\s+|=)(\S+)$/;
const KEPT_OPTION = /^(?:-i|--index-url|--extra-index-url)(?:\s|=)/;
const LOCAL_REQUIREMENT = /^(?:[./\\~]|[A-Za-z]:[\\/]|file:)|@\s*file:/;
const COMMENT = /(?:^|\s)#.*$/;

function containedFile(root, from, relative) {
  const base = path.resolve(root);
  const directory = path.relative(base, path.dirname(from));
  const full = path.resolve(base, directory, relative);
  if (!full.startsWith(base + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? full : undefined;
}

function logicalLines(file) {
  return readFileSync(file, 'utf8')
    .replaceAll(CONTINUATION, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(COMMENT, '').trim())
    .filter((line) => line !== '');
}

function classify(line) {
  if (INCLUDE.test(line)) {
    return { kind: 'include', value: INCLUDE.exec(line)[1] };
  }
  if (CONSTRAINT.test(line)) {
    return { kind: 'constraint', value: CONSTRAINT.exec(line)[1] };
  }
  if (line.startsWith('-')) {
    return { kind: KEPT_OPTION.test(line) ? 'keep' : 'drop', value: line };
  }
  return { kind: LOCAL_REQUIREMENT.test(line) ? 'drop' : 'keep', value: line };
}

function consumeLine(state, { root, file }, line) {
  const { kind, value } = classify(line);
  const followed =
    kind === 'include' || kind === 'constraint' ? containedFile(root, file, value) : undefined;
  if (kind === 'include' && followed !== undefined) {
    state.queue.push(followed);
    return;
  }
  if (kind === 'constraint' && followed !== undefined) {
    state.constraints.push(followed);
    return;
  }
  if (kind === 'keep') {
    state.lines.push(value);
    return;
  }
  state.dropped.push(`${path.relative(root, file)}: ${line}`);
}

export function safeRequirements(root, names) {
  const state = {
    queue: names.map((name) => path.resolve(root, name)),
    lines: [],
    constraints: [],
    dropped: [],
  };
  const seen = new Set();
  for (const file of state.queue) {
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const line of logicalLines(file)) {
      consumeLine(state, { root, file }, line);
    }
  }
  return { lines: state.lines, constraints: state.constraints, dropped: state.dropped };
}
