export const SOURCE_RULE_IDS = {
  componentStoryMissing: 'component-story-missing',
  javascriptInTypescriptProject: 'javascript-in-typescript-project',
  decidedCondition: 'decided-condition',
  duplicateBranch: 'duplicate-branch',
};

export function sourceRuleMessages(exceptionHint, allowed) {
  return {
    componentStoryMissing: `Most components in this project have a story. ${allowed('Add {story} for {name}.')} ${exceptionHint}`,
    componentStoryMissingUnenforced: `{name} has no story. ${allowed('Add {story}.')} Not enforced until more than half of the components have one. ${exceptionHint}`,
    decidedCondition: `\`{condition}\` is always {verdict} here: {reason}{consequence}. ${allowed('{fix}')} ${exceptionHint}`,
    duplicateBranch: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    javascriptInTypescriptProject: `{path} is JavaScript in a TypeScript project, so its values are not type-checked. ${allowed('Write it as a .ts or .tsx file: {typescript}.')} ${exceptionHint}`,
  };
}

export function sourceRules(ids, enforcedBy) {
  return [
    {
      id: ids.componentStoryMissing,
      check: 'structure',
      limit:
        'a component file without a story, in a package that has Storybook; enforced when more than half of its component files have one, reported otherwise',
      enforcedBy: { ...enforcedBy, javascript: 'partial' },
    },
    {
      id: ids.javascriptInTypescriptProject,
      check: 'structure',
      limit:
        'a `.js`, `.mjs`, `.cjs` or `.jsx` file under the source or test roots of a project with a `tsconfig.json` (at the root, in a package or referenced from one), except files under a `fixtures/` or `__fixtures__/` folder in a test location',
      enforcedBy: { ...enforcedBy, javascript: false },
    },
    {
      id: ids.decidedCondition,
      check: 'structure',
      limit:
        'an `if`, `while`, `when` arm, ternary or `&&`/`||` operand in a production function that the guards before it decide, proved by a solver (Z3, fixed resource limit): enclosing `if`s and their `else`, guard clauses that return, throw, break or continue, earlier `when` arms and the left side of `&&`/`||`; a write to a name, or a call that is not pure, forgets what was known about it, and arithmetic is an opaque value (JVM integers overflow); TypeScript and JavaScript report it as `nitpicker/no-decided-condition`',
    },
    {
      id: ids.duplicateBranch,
      check: 'structure',
      limit:
        "two arms of an `if`/`else if` chain, a ternary, a `switch` or a `when` in a production function whose bodies have the same canonical tree (the near-duplicate engine's rewrites, renamed locals of the arm count as equal, other names and literals must match; a `switch` case that falls through, or that a non-empty case falls into, and an arm picked by a type test are not compared); report-only: the same statements at the start or end of every arm of a complete `if` chain or `when`, when moving them keeps behaviour. Error Prone `DuplicateBranches` keeps the Java two-arm `if`/`else` and ternary, Ruff `SIM114` the adjacent Python `if`/`elif` arms",
    },
  ];
}

export function docCommentRule(ids) {
  return {
    id: ids.docCommentContent,
    check: 'coding-standards',
    limit:
      'a doc comment or docstring that only restates its declaration name (a tag or section with text, such as `@param id the account` or `Args:`, says more), or a description longer than 5 lines, tags, sections and code examples not counted (a Go `Deprecated:` paragraph or code block says more; TypeScript and JavaScript report it as `nitpicker/no-comments`)',
  };
}
