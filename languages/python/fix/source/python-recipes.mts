import type {
  Decline,
  ScriptRecipe,
  PlanContext,
  PlanEdit,
  ScriptPlanned,
  ScriptResult,
  PlanFile,
} from '../typed/fix-types.mts';
import type { ScriptSettings } from '../typed/script-types.mts';
import { defineRecipes } from '../typed/core-views.mts';
import { REVIEW, SAFE } from '../../../../core/fix/engine/safety.mjs';
import { scriptEdits } from './script-edits.mts';

const RULES_TOOL = 'python-rules';
const PRESET = 'python';

type Entry = { id: string; tool: string; rule: string; safety: string };
type EditsOf = (files: readonly PlanFile[], context?: { projectRoot: string }) => ScriptResult;

const TABLE: Entry[] = [
  { id: 'python-exc-info', tool: RULES_TOOL, rule: 'catch-log-without-exception', safety: SAFE },
  { id: 'python-falsy-default', tool: RULES_TOOL, rule: 'falsy-default', safety: REVIEW },
  { id: 'python-frozen-dataclass', tool: RULES_TOOL, rule: 'frozen-dataclass', safety: REVIEW },
  { id: 'python-http-timeout', tool: RULES_TOOL, rule: 'http-without-timeout', safety: REVIEW },
  { id: 'python-shell-arguments', tool: RULES_TOOL, rule: 'shell-command', safety: REVIEW },
  {
    id: 'python-tls-verification',
    tool: RULES_TOOL,
    rule: 'tls-verification-off',
    safety: REVIEW,
  },
  { id: 'python-safe-load', tool: RULES_TOOL, rule: 'unsafe-deserialization', safety: REVIEW },
  {
    id: 'python-collected-test-name',
    tool: RULES_TOOL,
    rule: 'uncollected-tests',
    safety: REVIEW,
  },
  { id: 'python-mutmut-pragma', tool: 'mutmut', rule: 'mutant-ignored', safety: REVIEW },
];

export function declineNote({ rule, path: name, line, reason }: Decline): string {
  return `--fix left ${name}:${String(line)} ${rule} as is: ${reason}`;
}

function occupied(edit: PlanEdit, read: (name: string) => string | undefined): boolean {
  return edit.type === 'move' && read(edit.to ?? '') !== undefined;
}

const PROJECT_READS = new Set(['frozen-dataclass']);

function planFor({ tool, rule }: Entry, editsOf: EditsOf): (context: PlanContext) => ScriptPlanned {
  return function plan({ files, read, projectRoot }: PlanContext): ScriptPlanned {
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

export function scriptRecipes({ runScript, optionsFor }: ScriptSettings): readonly ScriptRecipe[] {
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
