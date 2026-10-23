export const SOURCE_RULE_IDS = {
  componentStoryMissing: 'component-story-missing',
  javascriptInTypescriptProject: 'javascript-in-typescript-project',
};

export function sourceRuleMessages(exceptionHint, allowed) {
  return {
    componentStoryMissing: `Most components in this project have a story. ${allowed('Add {story} for {name}.')} ${exceptionHint}`,
    componentStoryMissingUnenforced: `{name} has no story. ${allowed('Add {story}.')} Not enforced until more than half of the components have one. ${exceptionHint}`,
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
  ];
}

export function docCommentRule(ids) {
  return {
    id: ids.docCommentContent,
    check: 'coding-standards',
    limit:
      'a doc comment that only restates its declaration name, or a description longer than 5 lines, code examples not counted (TypeScript and JavaScript report it as `nitpicker/no-comments`)',
  };
}
