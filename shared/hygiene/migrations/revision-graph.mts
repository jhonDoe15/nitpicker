import path from 'node:path';
import { readBoundedText } from '../../filesystem.mts';
import { graphCandidate } from './migration-files.mts';
import type {
  DjangoDependency,
  DjangoNode,
  GraphCandidate,
  RevisionGraphs,
  RevisionNode,
} from './migration-types.mts';

type ScanState = { readonly depth: number; readonly quote: string | undefined };
type Revision =
  | { readonly kind: 'alembic'; readonly node: RevisionNode }
  | { readonly kind: 'django'; readonly node: DjangoNode };

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

export function readSource(root: string, file: string): string | undefined {
  return readBoundedText(root, file, MAX_SOURCE_BYTES);
}

function quotedTexts(value: string): string[] {
  return [...value.matchAll(QUOTED)].map((match) => match.groups?.['text'] ?? '');
}

function alembicNode(file: string, text: string): RevisionNode | undefined {
  const revision = ALEMBIC_REVISION.exec(text);
  const parent = ALEMBIC_PARENT.exec(text);
  if (revision === null || parent === null) {
    return undefined;
  }
  const branch = ALEMBIC_BRANCH.exec(text)?.groups?.['value']?.trim() ?? 'None';
  return {
    path: file,
    id: revision.groups?.['id'] ?? '',
    parents: quotedTexts(parent.groups?.['value'] ?? ''),
    starts: branch !== 'None' && branch !== '()' && branch !== '[]',
  };
}

const BRACKET_DEPTH: Readonly<Record<string, number>> = { '[': 1, ']': -1 };

function scanStep(state: ScanState, character: string, previous: string): ScanState {
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

function bracketBody(text: string, open: number): string {
  let state: ScanState = { depth: 0, quote: undefined };
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

function djangoNode(file: string, text: string): DjangoNode | undefined {
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
    dependencies: [...body.matchAll(DJANGO_PAIR)].map(({ groups }): DjangoDependency => ({
      app: groups?.['app'] ?? '',
      name: groups?.['name'] ?? '',
    })),
    starts: DJANGO_REPLACES.test(text),
  };
}

function djangoLabel(nodes: ReadonlyMap<string, DjangoNode>, folderApp: string): string {
  const counts = new Map<string, number>();
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

function withDjangoParents(
  nodes: ReadonlyMap<string, DjangoNode>,
  folderApp: string,
): Map<string, RevisionNode> {
  const label = djangoLabel(nodes, folderApp);
  return new Map(
    [...nodes].map(([id, { dependencies, ...node }]): [string, RevisionNode] => [
      id,
      { ...node, parents: dependencies.filter(({ app }) => app === label).map(({ name }) => name) },
    ]),
  );
}

function revisionNode(root: string, file: string, candidate: GraphCandidate): Revision | undefined {
  const text = readSource(root, file);
  if (text === undefined) {
    return undefined;
  }
  if (candidate.kind === 'alembic') {
    const node = alembicNode(file, text);
    return node === undefined ? undefined : { kind: 'alembic', node };
  }
  const node = djangoNode(file, text);
  return node === undefined ? undefined : { kind: 'django', node };
}

type GraphEntry = {
  readonly candidate: GraphCandidate;
  readonly alembic: Map<string, RevisionNode>;
  readonly django: Map<string, DjangoNode>;
};

function addRevision(
  graphs: Map<string, GraphEntry>,
  candidate: GraphCandidate,
  revision: Revision,
): void {
  const graph = graphs.get(candidate.set) ?? {
    candidate,
    alembic: new Map<string, RevisionNode>(),
    django: new Map<string, DjangoNode>(),
  };
  if (revision.kind === 'alembic') {
    graph.alembic.set(revision.node.id, revision.node);
  } else {
    graph.django.set(revision.node.id, revision.node);
  }
  graphs.set(candidate.set, graph);
}

export function revisionGraphs(root: string, files: readonly string[]): RevisionGraphs {
  const graphs = new Map<string, GraphEntry>();
  for (const file of files) {
    const candidate = graphCandidate(file);
    const revision = candidate === undefined ? undefined : revisionNode(root, file, candidate);
    if (candidate !== undefined && revision !== undefined) {
      addRevision(graphs, candidate, revision);
    }
  }
  return new Map(
    [...graphs].map(
      ([set, { candidate, alembic, django }]): [string, Map<string, RevisionNode>] => [
        set,
        candidate.kind === 'django' ? withDjangoParents(django, candidate.app) : alembic,
      ],
    ),
  );
}
