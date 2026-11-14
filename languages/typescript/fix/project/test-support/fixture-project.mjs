import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { runRecipes } from '../../../../../core/fix/engine/run-recipes.mjs';

const TSCONFIG = {
  compilerOptions: {
    strict: true,
    target: 'es2022',
    module: 'nodenext',
    moduleResolution: 'nodenext',
    noEmit: true,
    skipLibCheck: true,
  },
  include: ['src', 'test'],
};

function treeOf(root) {
  const tree = [];
  for (const name of readdirSync(root, { recursive: true })) {
    const full = path.resolve(root, name);
    if (path.relative(root, full).startsWith('..')) {
      throw new Error(`${name} is outside the fixture project`);
    }
    if (!name.includes('node_modules') && statSync(full).isFile()) {
      tree.push([name.split(path.sep).join('/'), readFileSync(full, 'utf8')]);
    }
  }
  return tree;
}

export function useFixtureProjects() {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  function create(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-fix-'));
    roots.push(root);
    const all = {
      'tsconfig.json': JSON.stringify(TSCONFIG),
      'package.json': '{"type":"module"}',
      ...files,
    };
    for (const [name, text] of Object.entries(all).filter(([, text]) => text !== undefined)) {
      const full = path.resolve(root, name);
      if (path.relative(root, full).startsWith('..')) {
        throw new Error(`${name} is outside the fixture project`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  }
  function fix(files, { recipe, changed = Object.keys(files), rule, inputs = {} }) {
    const projectRoot = create(files);
    const result = runRecipes({
      projectRoot,
      files: changed.map((name) => ({ path: name })),
      recipes: [recipe],
      preset: 'typescript',
      selectedRules: rule === undefined ? [] : [rule],
      accepts: () => true,
      inputs,
    });
    return { ...result, projectRoot, tree: Object.fromEntries(treeOf(projectRoot)) };
  }
  return { fix, create, treeOf };
}
