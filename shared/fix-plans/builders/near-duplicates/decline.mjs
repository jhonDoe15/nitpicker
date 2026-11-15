import path from 'node:path';
import { languageOf } from '../../plan-parts/source.mjs';

const OTHER_FILES = 'the copies are in different files, and no recipe rewrites a pair across files';
const OTHER_FOLDERS =
  'the copies are in different files, and the Java recipe extracts a pair across files only when a same or parameterizable pair sits in one folder (one package)';
const OTHER_MODULES =
  'the copies are in different files, and no recipe rewrites a pair across files: the new module and the import in each file depend on the module system, the file extensions and the path rules of the project';
const SAME_FILE = 'no recipe applies to this pair';
const WHOLE = 'whole';
const COMMAND = 'nitpicker --fix --rule structure/near-duplicate';
const LANGUAGE_NAMES = { kotlin: 'Kotlin', python: 'Python', go: 'Go' };
const RECIPES = {
  typescript: {
    whole: 'typescript-extract-near-duplicate',
    partial: 'typescript-extract-partial-run',
  },
  java: { whole: 'java-extract-near-duplicate', partial: 'java-extract-partial-run' },
};

const KINDS = { same: WHOLE, parameterizable: WHOLE, 'partial-run': 'partial' };

function isOneFolderOfJava([first, second], verdict) {
  return (
    languageOf(first.path) === 'java' &&
    KINDS[verdict] === WHOLE &&
    path.posix.dirname(first.path) === path.posix.dirname(second.path)
  );
}

function recipeFor({ copies, verdict }) {
  const [first, second] = copies;
  const found = RECIPES[languageOf(first.path)]?.[KINDS[verdict]];
  return first.path === second.path || isOneFolderOfJava(copies, verdict) ? found : undefined;
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
const JAVA_TYPE_NOTE =
  'the copies differ in a type, and a type parameter cannot stand for it in a cast, an instanceof test, a class literal or a call on a value of that type';
const EXPRESSION_NOTE =
  'a differing expression needs its type written to become a Supplier: a declared local, a return or an if condition';
const WHOLE_CLASSES_NOTE =
  'the copies are in different classes, and only anonymous classes of one class can be extracted together';

function parameterNote(facts) {
  const { parameters = [] } = facts;
  if (parameters.some(({ kind }) => kind === 'type')) {
    return isJava(facts) ? JAVA_TYPE_NOTE : TYPE_NOTE;
  }
  return isJava(facts) && parameters.some(({ deferred }) => deferred) ? EXPRESSION_NOTE : undefined;
}

function factsNote(facts, recipe) {
  const [first, second] = facts.copies;
  const acrossFiles = first.path !== second.path;
  if (
    isJava(facts) &&
    !(acrossFiles && recipe === RECIPES.java.whole) &&
    new Set(facts.copies.map(({ symbol }) => classOf(symbol))).size > 1
  ) {
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

const OTHER_FILE_REASONS = { java: OTHER_FOLDERS, typescript: OTHER_MODULES };

function generalReason(facts) {
  const [first, second] = facts.copies;
  if (first.path !== second.path) {
    return { reason: OTHER_FILE_REASONS[languageOf(first.path)] ?? OTHER_FILES };
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
