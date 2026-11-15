import { type LintSettings, lintRule } from '../model/lint-rule.mts';
import type {
  FixContext,
  FixInputs,
  LintMessage,
  Planned,
  Project,
  ProjectFix,
  ProjectRecipe,
} from '../typed/project-types.mts';
import { withProject } from '../typed/project-views.mts';

export type PlanRequest = {
  readonly context: FixContext;
  readonly project: Project;
  readonly name: string;
  readonly message: LintMessage;
};

type LintRecipeSettings = {
  readonly id: string;
  readonly ruleId: string;
  readonly safety?: string;
  readonly scopeOf: (context: FixContext) => (name: string) => boolean;
  readonly optionsOf?: (context: FixContext) => readonly unknown[];
  readonly exclusive?: true;
  readonly typed?: true;
  readonly planMessage: (request: PlanRequest) => Planned | undefined;
};

type FixRequest = {
  readonly rule: string;
  readonly context: FixContext;
  readonly project: Project;
  readonly name: string;
  readonly planMessage: LintRecipeSettings['planMessage'];
  readonly lint: LintSettings;
};

function isLifted(inputs: FixInputs | undefined, ruleId: string, name: string): boolean {
  const isExcepted = inputs?.isExcepted;
  return isExcepted?.(ruleId, name) === true || isExcepted?.(`nitpicker/${ruleId}`, name) === true;
}

function fixesFor({ rule, context, project, name, planMessage, lint }: FixRequest): {
  fixes: ProjectFix[];
  notes: string[];
} {
  const fixes: ProjectFix[] = [];
  const notes: string[] = [];
  for (const message of lintRule(project, name, lint)) {
    const planned = planMessage({ context, project, name, message });
    const line = project.lineOf(name, message.start);
    if (planned?.edits !== undefined) {
      fixes.push({ finding: { tool: 'eslint', rule, path: name, line }, edits: planned.edits });
    } else if (planned !== undefined) {
      notes.push(`--fix left ${name}:${String(line)} ${lint.ruleId}: ${planned.declined}`);
    }
  }
  return { fixes, notes };
}

function onePerFile(fixes: readonly ProjectFix[]): ProjectFix[] {
  const touched = new Set<string>();
  return fixes.filter(({ edits }) => {
    const paths = edits.map((edit) => ('path' in edit ? edit.path : edit.from));
    if (paths.some((path) => touched.has(path))) {
      return false;
    }
    for (const path of paths) {
      touched.add(path);
    }
    return true;
  });
}

export function lintRecipe({
  id,
  ruleId,
  safety = 'review',
  scopeOf,
  optionsOf,
  exclusive,
  typed,
  planMessage,
}: LintRecipeSettings): ProjectRecipe {
  const rule = `nitpicker/${ruleId}`;
  return {
    id,
    rules: [{ tool: 'eslint', rule }],
    presets: ['typescript', 'javascript'],
    scope: 'project',
    safety,
    plan(context: FixContext) {
      const inScope = scopeOf(context);
      const lint = { ruleId, typed, options: optionsOf?.(context) ?? [] };
      const names = context.files.map(({ path: name }) => name);
      return withProject(context, (project) => {
        const found = names
          .filter((name) => inScope(name) && !isLifted(context.inputs, ruleId, name))
          .map((name) => fixesFor({ rule, context, project, name, planMessage, lint }));
        const fixes = found.flatMap((each) => each.fixes);
        return {
          fixes: exclusive === true ? onePerFile(fixes) : fixes,
          notes: found.flatMap(({ notes }) => notes),
        };
      });
    },
  };
}
