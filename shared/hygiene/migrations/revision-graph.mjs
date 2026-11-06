import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathInside } from '../../filesystem.mjs';
import { graphCandidate } from './migration-files.mjs';

const MAX_SOURCE_BYTES = 1024 * 1024;
const ALEMBIC_REVISION = /^revision\s*(?::[^=\n]+)?=\s*(?<quote>['"])(?<id>[^'"\n]+)\k<quote>/mu;
const ALEMBIC_PARENT =
  /^down_revision\s*(?::[^=\n]+)?=\s*(?<value>None\b|\([^)]*\)|\[[^\]]*\]|(?<quote>['"])[^'"\n]*\k<quote>)/mu;
const ALEMBIC_BRANCH = /^branch_labels\s*(?::[^=\n]+)?=\s*(?<value>\S[^\n]*)$/mu;
const QUOTED = /(?<quote>['"])(?<text>[^'"\n]+)\k<quote>/gu;
const DJANGO_CLASS = /^class\s+Migration\s*\(/mu;
const DJANGO_DEPENDENCIES = /^\s*dependencies\s*=\s*\[/mu;
const DJANGO_REPLACES = /^\s*replaces\s*=/mu;
const DJANGO_PAIR =
  /\(\s*(?<quote>['"])(?<app>[^'"\n]+)\k<quote>\s*,\s*(?<q2>['"])(?<name>[^'"\n]+)\k<q2>\s*\)/gu;

export function readSource(root, file) {
  const filePath = pathInside(root, file);
  if (filePath === undefined) {
    return undefined;
  }
  const stats = lstatSync(filePath, { throwIfNoEntry: false });
  return stats?.isFile() === true && stats.size <= MAX_SOURCE_BYTES
    ? readFileSync(filePath, 'utf8')
    : undefined;
}

function quotedTexts(value) {
  return [...value.matchAll(QUOTED)].map((match) => match.groups.text);
}

function alembicNode(file, text) {
  const revision = ALEMBIC_REVISION.exec(text);
  const parent = ALEMBIC_PARENT.exec(text);
  if (revision === null || parent === null) {
    return undefined;
  }
  const branch = ALEMBIC_BRANCH.exec(text)?.groups.value.trim() ?? 'None';
  return {
    path: file,
    id: revision.groups.id,
    parents: quotedTexts(parent.groups.value),
    starts: branch !== 'None' && branch !== '()' && branch !== '[]',
  };
}

const BRACKET_DEPTH = { '[': 1, ']': -1 };

function scanStep(state, character, previous) {
  if (state.quote !== undefined) {
    return {
      ...state,
      quote: character === state.quote && previous !== '\\' ? undefined : state.quote,
    };
  }
  if (character === "'" || character === '"') {
    return { ...state, quote: character };
  }
  return { ...state, depth: state.depth + (BRACKET_DEPTH[character] ?? 0) };
}

function bracketBody(text, open) {
  let state = { depth: 0, quote: undefined };
  let previous = '';
  for (const [offset, character] of text.slice(open).split('').entries()) {
    state = scanStep(state, character, previous);
    previous = character;
    if (state.depth === 0) {
      return text.slice(open + 1, open + offset);
    }
  }
  return text.slice(open + 1);
}

function djangoNode(file, text) {
  if (!DJANGO_CLASS.test(text)) {
    return undefined;
  }
  const dependencies = DJANGO_DEPENDENCIES.exec(text);
  const body =
    dependencies === null
      ? ''
      : bracketBody(text, dependencies.index + dependencies[0].lastIndexOf('['));
  return {
    path: file,
    id: path.posix.basename(file, '.py'),
    dependencies: [...body.matchAll(DJANGO_PAIR)].map(({ groups }) => groups),
    starts: DJANGO_REPLACES.test(text),
  };
}

function djangoLabel(nodes, folderApp) {
  const counts = new Map();
  for (const { dependencies } of nodes.values()) {
    for (const { app } of dependencies.filter(({ name }) => nodes.has(name))) {
      counts.set(app, (counts.get(app) ?? 0) + 1);
    }
  }
  if (counts.size === 0 || counts.has(folderApp)) {
    return folderApp;
  }
  return [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

function withDjangoParents(nodes, folderApp) {
  const label = djangoLabel(nodes, folderApp);
  return new Map(
    [...nodes].map(([id, { dependencies, ...node }]) => [
      id,
      { ...node, parents: dependencies.filter(({ app }) => app === label).map(({ name }) => name) },
    ]),
  );
}

function revisionNode(root, file, candidate) {
  const text = readSource(root, file);
  if (text === undefined) {
    return undefined;
  }
  return candidate.kind === 'alembic' ? alembicNode(file, text) : djangoNode(file, text);
}

export function revisionGraphs(root, files) {
  const graphs = new Map();
  for (const file of files) {
    const candidate = graphCandidate(file);
    const node = candidate === undefined ? undefined : revisionNode(root, file, candidate);
    if (node !== undefined) {
      const graph = graphs.get(candidate.set) ?? { candidate, nodes: new Map() };
      graph.nodes.set(node.id, node);
      graphs.set(candidate.set, graph);
    }
  }
  return new Map(
    [...graphs].map(([set, { candidate, nodes }]) => [
      set,
      candidate.kind === 'django' ? withDjangoParents(nodes, candidate.app) : nodes,
    ]),
  );
}
