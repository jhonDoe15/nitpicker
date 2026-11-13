import { lintRule } from '../model/lint-rule.mjs';
import { withProject } from '../model/project-model.mjs';

function isLifted(inputs, ruleId, name) {
  const isExcepted = inputs?.isExcepted;
  return isExcepted?.(ruleId, name) === true || isExcepted?.(`nitpicker/${ruleId}`, name) === true;
}

function fixesFor({ rule, context, project, name, planMessage, lint }) {
  const fixes = [];
  const notes = [];
  for (const message of lintRule(project, name, lint)) {
    const planned = planMessage({ context, project, name, message });
    const line = project.lineOf(name, message.start);
    if (planned?.edits !== undefined) {
      fixes.push({ finding: { tool: 'eslint', rule, path: name, line }, edits: planned.edits });
    } else if (planned !== undefined) {
      notes.push(`--fix left ${name}:${line} ${lint.ruleId}: ${planned.declined}`);
    }
  }
  return { fixes, notes };
}

export function lintRecipe({
  id,
  ruleId,
  safety = 'review',
  scopeOf,
  optionsOf,
  typed,
  planMessage,
}) {
  const rule = `nitpicker/${ruleId}`;
  return {
    id,
    rules: [{ tool: 'eslint', rule }],
    presets: ['typescript', 'javascript'],
    scope: 'project',
    safety,
    plan(context) {
      const inScope = scopeOf(context);
      const lint = { ruleId, typed, options: optionsOf?.(context) ?? [] };
      const names = context.files.map(({ path: name }) => name);
      return withProject(context, (project) => {
        const found = names
          .filter((name) => inScope(name) && !isLifted(context.inputs, ruleId, name))
          .map((name) => fixesFor({ rule, context, project, name, planMessage, lint }));
        return {
          fixes: found.flatMap(({ fixes }) => fixes),
          notes: found.flatMap(({ notes }) => notes),
        };
      });
    },
  };
}
