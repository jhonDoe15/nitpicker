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
import { runRecipes as untypedRunRecipes } from '../../../../../core/fix/engine/run-recipes.mjs';
import type { FixInputs, ProjectRecipe } from '../typed/project-types.mts';

type FixtureFiles = Readonly<Record<string, string | undefined>>;
type FixRequest = {
  recipe: ProjectRecipe;
  changed?: string[] | undefined;
  rule?: string;
  inputs?: FixInputs;
};
type RecipeRun = { fixedFindings: string[]; toolErrors: unknown[]; notes: string[] };
export type FixedProject = RecipeRun & { projectRoot: string; tree: Record<string, string> };
type FixtureProjects = {
  fix(files: FixtureFiles, request: FixRequest): FixedProject;
  create(files: FixtureFiles): string;
  treeOf(root: string): [string, string][];
};

type RunSettings = {
  inputs: FixInputs;
  projectRoot: string;
  files: { path: string }[];
  recipes: ProjectRecipe[];
  preset: string;
  selectedRules: string[];
  accepts: () => boolean;
};

const runRecipes: (settings: RunSettings) => RecipeRun = untypedRunRecipes;

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

function treeOf(root: string): [string, string][] {
  const tree: [string, string][] = [];
  for (const name of readdirSync(root, { encoding: 'utf8', recursive: true })) {
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

export function useFixtureProjects(): FixtureProjects {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  function create(files: FixtureFiles): string {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-fix-'));
    roots.push(root);
    const all: FixtureFiles = {
      'tsconfig.json': JSON.stringify(TSCONFIG),
      'package.json': '{"type":"module"}',
      ...files,
    };
    for (const [name, text] of Object.entries(all)) {
      if (text === undefined) {
        continue;
      }
      const full = path.resolve(root, name);
      if (path.relative(root, full).startsWith('..')) {
        throw new Error(`${name} is outside the fixture project`);
      }
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, text);
    }
    return root;
  }
  function fix(
    files: FixtureFiles,
    { recipe, changed = Object.keys(files), rule, inputs = {} }: FixRequest,
  ): FixedProject {
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
