import path from 'node:path';
import { produceDesignFacts } from '../producer/design-facts.mjs';

const FIXTURES = path.join(import.meta.dirname, '../fixtures');
const SOURCE_ROOT = 'src/main/java';

export function fixtureRoot(name) {
  return path.join(FIXTURES, name);
}

export function fixtureFacts(name, modules) {
  return produceDesignFacts({
    projectRoot: fixtureRoot(name),
    modules: modules ?? [{ dir: '', sourceRoots: [SOURCE_ROOT], published: false }],
  });
}

function sourcePath(file, root = SOURCE_ROOT) {
  return `${root}/${file}`;
}

export function ref(file, symbol, root) {
  return `${sourcePath(file, root)}#${symbol}`;
}

export function callable({ file, owner, member, line, name = member, root, ...rest }) {
  return {
    id: ref(file, `${owner}.${member}`, root),
    file: sourcePath(file, root),
    name,
    line,
    kind: 'method',
    owner: ref(file, owner, root),
    exported: true,
    params: [],
    calls: [],
    paramUses: [],
    decisions: [],
    reads: [],
    ...rest,
  };
}

export function type({ file, symbol, line, kind, root, ...rest }) {
  return {
    id: ref(file, symbol, root),
    file: sourcePath(file, root),
    name: symbol.split('.').at(-1),
    line,
    kind,
    exported: true,
    fields: [],
    ...rest,
  };
}
