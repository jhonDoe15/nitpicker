import { configFile, fixesFor } from './config-edits.mjs';
import { operationFor } from './config-fixes.mjs';
import { springConfigTargets } from './config-targets.mjs';

const RULES = [
  'ddl-auto',
  'open-in-view',
  'error-details',
  'actuator-exposure',
  'risky-startup-flags',
  'unsafe-diagnostics',
  'literal-secret',
  'active-profile',
];

function recipePlan(rule) {
  return ({ files, read, projectRoot }) => {
    const targets = springConfigTargets({ projectRoot, files }).filter(
      (target) => target.rule === rule,
    );
    const paths = [...new Set(targets.map(({ path: name }) => name))];
    const results = paths.map((name) =>
      fixesFor(
        configFile({ path: name, text: read(name) }),
        targets
          .filter((target) => target.path === name)
          .map((target) => ({ target, op: operationFor(target) })),
      ),
    );
    return {
      fixes: results.flatMap(({ fixes }) =>
        fixes.map(({ item, edits }) => ({
          finding: {
            tool: 'spring',
            rule,
            path: item.target.path,
            line: item.target.entry?.line ?? 1,
          },
          edits,
        })),
      ),
      notes: results.flatMap(({ notes }) => notes),
    };
  };
}

export const SPRING_CONFIG_RECIPES = RULES.map((rule) => ({
  id: `spring-${rule}`,
  rules: [{ tool: 'spring', rule }],
  presets: ['java', 'kotlin'],
  scope: 'file',
  safety: 'review',
  plan: recipePlan(rule),
}));
