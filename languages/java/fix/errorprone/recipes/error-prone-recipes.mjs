import { hunkEdit } from '../patch/hunk-edits.mjs';
import { ownChecksOf, ownRule } from '../own/own-checks.mjs';
import { REVIEW_CHECKS, ruleOf, SAFE_CHECKS } from '../checks/error-prone-checks.mjs';

const PRESETS = ['java', 'kotlin'];

function editOf(text, name, { hunk, line }) {
  const edit = hunkEdit(text, hunk);
  return edit === undefined
    ? undefined
    : {
        line: line ?? edit.line,
        edit: { type: 'replace', path: name, start: edit.start, end: edit.end, text: edit.text },
      };
}

function fixesOf(entries, files, { names, ruleFor }) {
  const texts = new Map(files.map(({ path: name, text }) => [name, text]));
  return [...entries].flatMap(([name, hunks]) => {
    const text = texts.get(name);
    const found = new Map();
    for (const entry of text === undefined ? [] : hunks.filter(({ label }) => names.has(label))) {
      const placed = editOf(text, name, entry);
      const key = `${entry.label}:${placed?.line}`;
      if (placed !== undefined) {
        const same = found.get(key);
        found.set(key, {
          finding: { ...ruleFor(entry.label), path: name, line: placed.line },
          edits: [...(same?.edits ?? []), placed.edit],
        });
      }
    }
    return [...found.values()];
  });
}

function recipeOf({ id, checks, safety, entries, ruleFor = ruleOf }) {
  const names = new Set(checks);
  return {
    id,
    rules: checks.map(ruleFor),
    presets: PRESETS,
    scope: 'file',
    safety,
    plan({ files }) {
      return { fixes: fixesOf(entries, files, { names, ruleFor }) };
    },
  };
}

function ownRecipe(id, safety, entries) {
  return recipeOf({ id, checks: ownChecksOf(safety), safety, entries, ruleFor: ownRule });
}

export function errorProneRecipes(entries) {
  return [
    recipeOf({ id: 'java-error-prone-safe', checks: SAFE_CHECKS, safety: 'safe', entries }),
    recipeOf({ id: 'java-error-prone-review', checks: REVIEW_CHECKS, safety: 'review', entries }),
    ownRecipe('java-source-safe', 'safe', entries),
    ownRecipe('java-source-review', 'review', entries),
  ];
}
