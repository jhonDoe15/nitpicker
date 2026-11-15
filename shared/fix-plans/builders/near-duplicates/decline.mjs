import { languageOf } from '../../plan-parts/source.mjs';

const OTHER_FILES = 'the copies are in different files, and no recipe rewrites a pair across files';
const SAME_FILE = 'no recipe applies to this pair';
const COMMAND = 'nitpicker --fix --rule structure/near-duplicate';
const LANGUAGE_NAMES = { kotlin: 'Kotlin', python: 'Python', go: 'Go' };
const RECIPES = {
  typescript: {
    whole: 'typescript-extract-near-duplicate',
    partial: 'typescript-extract-partial-run',
  },
  java: { whole: 'java-extract-near-duplicate', partial: 'java-extract-partial-run' },
};

const KINDS = { same: 'whole', parameterizable: 'whole', 'partial-run': 'partial' };

function recipeFor({ copies, verdict }) {
  const [first, second] = copies;
  return first.path === second.path ? RECIPES[languageOf(first.path)]?.[KINDS[verdict]] : undefined;
}

function classOf(symbol) {
  const bare = symbol.replace(/\(.*$/su, '').replace(/#\d+$/u, '');
  return bare.slice(0, Math.max(bare.lastIndexOf('.'), 0));
}

function isJava(facts) {
  return languageOf(facts.copies[0].path) === 'java';
}

const TYPE_NOTE =
  'the copies differ in a type, and a type parameter cannot stand for it after new, in a cast or an instanceof';
const EXPRESSION_NOTE =
  'a differing expression needs its type written to become a Supplier: a declared local, a return or an if condition';
const WHOLE_CLASSES_NOTE =
  'the copies are in different classes, and only anonymous classes of one class can be extracted together';

function parameterNote(facts) {
  const { parameters = [] } = facts;
  if (parameters.some(({ kind }) => kind === 'type')) {
    return TYPE_NOTE;
  }
  return isJava(facts) && parameters.some(({ deferred }) => deferred) ? EXPRESSION_NOTE : undefined;
}

function factsNote(facts, recipe) {
  if (isJava(facts) && new Set(facts.copies.map(({ symbol }) => classOf(symbol))).size > 1) {
    return recipe === RECIPES.java.whole
      ? WHOLE_CLASSES_NOTE
      : 'the copies are in different classes';
  }
  return parameterNote(facts);
}

function recipeNote(recipe) {
  return (facts) => (recipeFor(facts) === recipe ? factsNote(facts, recipe) : undefined);
}

const RECIPE_DECLINES = Object.freeze(
  Object.values(RECIPES)
    .flatMap(Object.values)
    .map((recipe) => ({ recipe, note: recipeNote(recipe) })),
);

function generalReason(facts) {
  const [first, second] = facts.copies;
  if (first.path !== second.path) {
    return { reason: OTHER_FILES };
  }
  const name = LANGUAGE_NAMES[languageOf(first.path)];
  return {
    reason: name === undefined ? SAME_FILE : `no recipe extracts near-duplicate copies in ${name}`,
  };
}

/**
 * Why no recipe made the change: the first recipe's own note, else the recipe that handles the pair
 * with the command that runs it, else a general reason.
 */
export function declineReason(facts, declines = RECIPE_DECLINES) {
  for (const { recipe, note } of declines) {
    const reason = note(facts);
    if (reason !== undefined) {
      return { recipe, reason };
    }
  }
  const recipe = recipeFor(facts);
  return recipe === undefined ? generalReason(facts) : { recipe, command: COMMAND };
}
