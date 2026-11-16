import path from 'node:path';
import { lintRecipe, type PlanRequest } from '../plan/lint-recipe.mts';
import { moveToDependencies, nearestManifest } from '../typed/preset-views.mts';
import type { FixContext, Planned, ProjectEdit } from '../typed/project-types.mts';
import { composed, declined, productionScope } from '../typed/project-views.mts';
import { fieldOf, parseJson as parseJsonText } from '../../../../../shared/values/readers.mts';

const MESSAGE = /^(\S+) is only a devDependency/u;

function parseJson(text: string): { json?: unknown; error?: unknown } {
  try {
    return { json: parseJsonText(text) };
  } catch (error) {
    return { error };
  }
}

function movedValid(text: string, edits: readonly ProjectEdit[], packageName: string): boolean {
  const before = parseJson(text);
  const after = parseJson(composed(text, edits));
  if (before.json === undefined || after.json === undefined) {
    return false;
  }
  return (
    fieldOf(fieldOf(after.json, 'dependencies'), packageName) ===
      fieldOf(fieldOf(before.json, 'devDependencies'), packageName) &&
    fieldOf(fieldOf(after.json, 'devDependencies'), packageName) === undefined
  );
}

function manifestOf(context: FixContext, name: string): string | undefined {
  const found = nearestManifest(path.dirname(path.resolve(context.projectRoot, name)));
  return found?.kind === 'manifest'
    ? path.relative(context.projectRoot, found.file).split(path.sep).join('/')
    : undefined;
}

function planMessage({ context, name, message }: PlanRequest): Planned | undefined {
  const [, packageName] = MESSAGE.exec(message.message) ?? [];
  const manifest = packageName === undefined ? undefined : manifestOf(context, name);
  if (manifest === undefined || packageName === undefined) {
    return undefined;
  }
  const text = context.read(manifest);
  const edits = text === undefined ? undefined : moveToDependencies(manifest, text, packageName);
  if (
    text === undefined ||
    edits === undefined ||
    !context.accepts(manifest) ||
    !movedValid(text, edits, packageName)
  ) {
    return declined(
      `${manifest} has no devDependencies entry for ${packageName} that --fix can move`,
    );
  }
  return { edits };
}

export const noDevDependencyInProductionRecipe = lintRecipe({
  id: 'typescript-no-dev-dependency-in-production',
  ruleId: 'no-dev-dependency-in-production',
  exclusive: true,
  scopeOf: (context) => productionScope(context.inputs),
  planMessage,
});
