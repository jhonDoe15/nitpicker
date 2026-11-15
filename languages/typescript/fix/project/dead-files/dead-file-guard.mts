import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../../shared/paths/checkout-module.mjs';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type { Project } from '../typed/project-types.mts';

type PlannedDeletion = { readonly name: string; readonly deleted: boolean };
type ProjectSettings = {
  readonly projectRoot: string;
  readonly files: readonly { readonly path: string }[];
  readonly read: (name: string) => string | undefined;
};

const require = createRequire(import.meta.url);
const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

function modulePath(module: string): string {
  return checkoutModulePath(fileURLToPath(new URL(module, import.meta.url)));
}

type ProjectModel = {
  readonly withProject: <T>(settings: ProjectSettings, work: (project: Project) => T) => T;
};
type Declines = {
  readonly fileReferenceProblem: (project: Project, target: string) => string | undefined;
};

function isProjectModel(value: unknown): value is ProjectModel {
  return typeof fieldOf(value, 'withProject') === 'function';
}

function isDeclines(value: unknown): value is Declines {
  return typeof fieldOf(value, 'fileReferenceProblem') === 'function';
}

function loadedModel(): ProjectModel {
  const loaded: unknown = require(modulePath('../model/project-model.mjs'));
  if (!isProjectModel(loaded)) {
    throw new TypeError('The project model does not load');
  }
  return loaded;
}

function loadedDeclines(): Declines {
  const loaded: unknown = require(modulePath('../edits/declines.mjs'));
  if (!isDeclines(loaded)) {
    throw new TypeError('The edit declines do not load');
  }
  return loaded;
}

function readFromDisk(projectRoot: string): (name: string) => string | undefined {
  return (name: string) => {
    const file = path.resolve(projectRoot, name);
    if (path.relative(projectRoot, file).startsWith('..')) {
      return undefined;
    }
    return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  };
}

export function guardDeletions<Planned extends PlannedDeletion>(
  projectRoot: string,
  planned: readonly Planned[],
): { planned: readonly Planned[]; notes: string[] } {
  const deletions = planned.filter(({ deleted }) => deleted);
  if (deletions.length === 0) {
    return { planned, notes: [] };
  }
  const { withProject } = loadedModel();
  const { fileReferenceProblem } = loadedDeclines();
  const problems = withProject(
    {
      projectRoot,
      files: deletions.map(({ name }) => ({ path: name })),
      read: readFromDisk(projectRoot),
    },
    (project: Project) =>
      new Map(deletions.map(({ name }) => [name, fileReferenceProblem(project, name)])),
  );
  return {
    planned: planned.filter(({ name }) => problems.get(name) === undefined),
    notes: [...problems].flatMap(([name, problem]) =>
      problem === undefined ? [] : [`--fix kept ${name}, which knip reports unused: ${problem}`],
    ),
  };
}
