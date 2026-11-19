import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FixRecipe } from '../../../../../../core/fix/typed/fix-types.mts';
import { applyRecipe } from './apply-recipe.mts';

const HERMETIC = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
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
  spawnSync('git', ['init', '-q'], { cwd: root, env: HERMETIC, timeout: GIT_TIMEOUT });
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
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
