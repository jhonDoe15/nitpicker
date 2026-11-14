import path from 'node:path';
import { nearestManifest } from '../../../preset/eslint-plugin/rules/dependencies/package-manifest.mjs';
import { composed, declined } from '../edits/text-edits.mjs';
import { productionScope } from '../model/project-model.mjs';
import { lintRecipe } from '../plan/lint-recipe.mjs';
import { moveToDependencies } from './manifest-move.mjs';

const MESSAGE = /^(\S+) is only a devDependency/u;

function parseJson(text) {
  try {
    return { json: JSON.parse(text) };
  } catch (error) {
    return { error };
  }
}

function movedValid(text, edits, packageName) {
  const before = parseJson(text);
  const after = parseJson(composed(text, edits));
  if (before.json === undefined || after.json === undefined) {
    return false;
  }
  return (
    after.json.dependencies?.[packageName] === before.json.devDependencies?.[packageName] &&
    after.json.devDependencies?.[packageName] === undefined
  );
}

function manifestOf(context, name) {
  const found = nearestManifest(path.dirname(path.resolve(context.projectRoot, name)));
  return found.kind === 'manifest'
    ? path.relative(context.projectRoot, found.file).split(path.sep).join('/')
    : undefined;
}

function planMessage({ context, name, message }) {
  const [, packageName] = MESSAGE.exec(message.message) ?? [];
  const manifest = packageName === undefined ? undefined : manifestOf(context, name);
  if (manifest === undefined) {
    return undefined;
  }
  const text = context.read(manifest);
  const edits = text === undefined ? undefined : moveToDependencies(manifest, text, packageName);
  if (edits === undefined || !context.accepts(manifest) || !movedValid(text, edits, packageName)) {
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
