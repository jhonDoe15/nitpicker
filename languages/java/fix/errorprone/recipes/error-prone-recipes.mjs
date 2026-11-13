import { hunkEdit } from '../patch/hunk-edits.mjs';
import {
  ERROR_PRONE_TOOL,
  REVIEW_CHECKS,
  ruleOf,
  SAFE_CHECKS,
} from '../checks/error-prone-checks.mjs';

const PRESETS = ['java', 'kotlin'];

function fixesOf(entries, files, inGroup) {
  const texts = new Map(files.map(({ path: name, text }) => [name, text]));
  return [...entries].flatMap(([name, hunks]) => {
    const text = texts.get(name);
    return text === undefined
      ? []
      : hunks
          .filter(({ label }) => inGroup(label))
          .flatMap(({ label, hunk }) => {
            const edit = hunkEdit(text, hunk);
            return edit === undefined
              ? []
              : [
                  {
                    finding: { tool: ERROR_PRONE_TOOL, rule: label, path: name, line: edit.line },
                    edits: [
                      {
                        type: 'replace',
                        path: name,
                        start: edit.start,
                        end: edit.end,
                        text: edit.text,
                      },
                    ],
                  },
                ];
          });
  });
}

function recipeOf({ id, checks, safety, entries }) {
  const names = new Set(checks);
  return {
    id,
    rules: checks.map(ruleOf),
    presets: PRESETS,
    scope: 'file',
    safety,
    plan({ files }) {
      return { fixes: fixesOf(entries, files, (label) => names.has(label)) };
    },
  };
}

export function errorProneRecipes(entries) {
  return [
    recipeOf({ id: 'java-error-prone-safe', checks: SAFE_CHECKS, safety: 'safe', entries }),
    recipeOf({ id: 'java-error-prone-review', checks: REVIEW_CHECKS, safety: 'review', entries }),
  ];
}
