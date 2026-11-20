import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FixRecipe } from '../../../../../../core/fix/typed/fix-types.mts';
import { applyRecipe } from './apply-recipe.mts';

const GIT_TIMEOUT = 10_000;

export const KOTLIN_BUILD = {
  'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "1.9.24"\n}\n',
};

export const ORDER_REPOSITORY = {
  'src/main/kotlin/demo/OrderRepository.kt':
    'package demo\n\ninterface OrderRepository : JpaRepository<Order, Long>\n',
};

export function kotlinProject(files: Readonly<Record<string, string>>): {
  readonly root: string;
  readonly remove: () => void;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-project-'));
  spawnSync('git', ['init', '-q'], { cwd: root, timeout: GIT_TIMEOUT });
  for (const [name, text] of Object.entries(files)) {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) {
      throw new Error(`${name} is outside the project`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return {
    root,
    remove: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function fixerIn(
  recipe: FixRecipe,
  files: Readonly<Record<string, string>>,
): { readonly root: string; readonly remove: () => void; readonly fix: (text: string) => string } {
  const project = kotlinProject(files);
  return { ...project, fix: (text) => applyRecipe(recipe, text, undefined, project.root) };
}
