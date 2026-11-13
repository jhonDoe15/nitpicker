import { defineRecipes } from '../../../../core/fix/engine/recipes.mjs';
import { localRunScript, scriptEdits } from './script-edits.mjs';

const RULES_TOOL = 'python-rules';
const PRESET = 'python';

const TABLE = [
  { id: 'python-exc-info', tool: RULES_TOOL, rule: 'catch-log-without-exception', safety: 'safe' },
  { id: 'python-falsy-default', tool: RULES_TOOL, rule: 'falsy-default', safety: 'review' },
  { id: 'python-frozen-dataclass', tool: RULES_TOOL, rule: 'frozen-dataclass', safety: 'review' },
  { id: 'python-http-timeout', tool: RULES_TOOL, rule: 'http-without-timeout', safety: 'review' },
  { id: 'python-shell-arguments', tool: RULES_TOOL, rule: 'shell-command', safety: 'review' },
  {
    id: 'python-tls-verification',
    tool: RULES_TOOL,
    rule: 'tls-verification-off',
    safety: 'review',
  },
  { id: 'python-safe-load', tool: RULES_TOOL, rule: 'unsafe-deserialization', safety: 'review' },
  {
    id: 'python-collected-test-name',
    tool: RULES_TOOL,
    rule: 'uncollected-tests',
    safety: 'review',
  },
  { id: 'python-mutmut-pragma', tool: 'mutmut', rule: 'mutant-ignored', safety: 'review' },
];

function declineNote({ rule, path: name, line, reason }) {
  return `--fix left ${name}:${String(line)} ${rule} as is: ${reason}`;
}

function occupied(edit, read) {
  return edit.type === 'move' && read(edit.to) !== undefined;
}

const PROJECT_READS = new Set(['frozen-dataclass']);

function planFor({ tool, rule }, editsOf) {
  return function plan({ files, read, projectRoot }) {
    const found = editsOf(files, PROJECT_READS.has(rule) ? { projectRoot } : undefined);
    const fixes = found.fixes.filter(
      ({ finding }) => finding.tool === tool && finding.rule === rule,
    );
    const clear = fixes.filter(({ edits }) => !edits.some((edit) => occupied(edit, read)));
    const taken = fixes.length - clear.length;
    return {
      fixes: clear,
      notes: [
        ...found.declines.filter((decline) => decline.rule === rule).map(declineNote),
        ...(taken === 0
          ? []
          : [`--fix left ${String(taken)} ${rule} file(s) as is: the new name exists`]),
      ],
    };
  };
}

export function createPythonRecipes({ runScript, optionsFor }) {
  const editsOf = scriptEdits({
    runScript,
    optionsFor,
    rules: TABLE.map(({ rule }) => rule),
  });
  return defineRecipes(
    TABLE.map((entry) => ({
      id: entry.id,
      rules: [{ tool: entry.tool, rule: entry.rule }],
      presets: [PRESET],
      scope: 'file',
      safety: entry.safety,
      plan: planFor(entry, editsOf),
    })),
  );
}

export const PYTHON_RECIPES = createPythonRecipes({
  runScript: localRunScript,
  optionsFor: () => ({}),
});
