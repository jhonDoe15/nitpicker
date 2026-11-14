const STRUCTURE_TOOL = 'structure';

export const SOURCE_RULE_IDS = {
  componentStoryMissing: 'component-story-missing',
  javascriptInTypescriptProject: 'javascript-in-typescript-project',
  decidedCondition: 'decided-condition',
  duplicateBranch: 'duplicate-branch',
  resultSlip: 'result-slip',
};

export function sourceRuleMessages(exceptionHint, allowed) {
  return {
    componentStoryMissing: `Most components in this project have a story. ${allowed('Add {story} for {name}.')} ${exceptionHint}`,
    componentStoryMissingUnenforced: `{name} has no story. ${allowed('Add {story}.')} Not enforced until more than half of the components have one. ${exceptionHint}`,
    decidedCondition: `\`{condition}\` is always {verdict} here: {reason}{consequence}. ${allowed('{fix}')} ${exceptionHint}`,
    duplicateBranch: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    resultSlip: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    javascriptInTypescriptProject: `{path} is JavaScript in a TypeScript project, so its values are not type-checked. ${allowed('Write it as a .ts or .tsx file: {typescript}.')} ${exceptionHint}`,
  };
}

export function sourceRules(ids, enforcedBy) {
  return [
    {
      id: ids.componentStoryMissing,
      check: STRUCTURE_TOOL,
      limit:
        'a component file without a story, in a package that has Storybook; enforced when more than half of its component files have one, reported otherwise',
      enforcedBy: { ...enforcedBy, javascript: 'partial' },
    },
    {
      id: ids.javascriptInTypescriptProject,
      check: STRUCTURE_TOOL,
      limit:
        'a `.js`, `.mjs`, `.cjs` or `.jsx` file under the source or test roots of a project with a `tsconfig.json` (at the root, in a package or referenced from one), except files under a `fixtures/` or `__fixtures__/` folder in a test location',
      enforcedBy: { ...enforcedBy, javascript: false },
    },
    {
      id: ids.decidedCondition,
      check: STRUCTURE_TOOL,
      limit:
        'an `if`, `while`, `when` arm, ternary or `&&`/`||` operand in a production function that the guards before it decide, proved by a solver (Z3, fixed resource limit): enclosing `if`s and their `else`, guard clauses that return, throw, break or continue, earlier `when` arms, the arms of a `switch`, `when (subject)` or `match` (the label in its own arm, every earlier label excluded in `default`/`else`, nothing for fall-through, pattern or guarded arms) and a `case` label the facts before the switch rule out, precondition calls and asserts matched by their import (`Objects.requireNonNull`, Guava `Preconditions`, Spring `Assert`, commons-lang `Validate`, Kotlin `require`/`check`/`requireNotNull`, `node:assert`, project `asserts` functions; an `assert` only removes redundant checks), the left side of `&&`/`||`, the test of a counted loop (Java and TypeScript `for`, Python `range`, Kotlin `until`, `..` and `downTo`), the branches of a ternary or `if` expression, and facts about names a lambda captures when they cannot change; Java and Kotlin `equals` and `Objects.equals` against a string, boolean or enum constant count as `==`; sizes and lengths (whole numbers, never negative, `isEmpty()` meaning a size of 0), index searches (at least -1), absolute values of floating-point numbers and `Math.random()` are known by the declared types of their receivers (TypeScript: the type checker), a same-file getter that only returns a field and a known pure library method return the same value until something changes; a declaration or plain assignment of a literal (or of a local of an exact type) to a local, until the next write to it; a write to a name, or a call that is not pure, forgets what was known about it, and arithmetic is an opaque value (JVM integers overflow); TypeScript and JavaScript report it as `nitpicker/no-decided-condition`',
    },
    {
      id: ids.duplicateBranch,
      check: STRUCTURE_TOOL,
      limit:
        "two arms of an `if`/`else if` chain, a ternary, a `switch` or a `when` in a production function whose bodies have the same canonical tree (the near-duplicate engine's rewrites, renamed locals of the arm count as equal, other names and literals must match; a `switch` case that falls through, or that a non-empty case falls into, and an arm picked by a type test are not compared); report-only: the same statements at the start or end of every arm of a complete `if` chain or `when`, when moving them keeps behaviour. Error Prone `DuplicateBranches` keeps the Java two-arm `if`/`else` and ternary, Ruff `SIM114` the adjacent Python `if`/`elif` arms",
    },
    {
      id: ids.resultSlip,
      check: STRUCTURE_TOOL,
      limit:
        'a comparison in a production function that cannot test what it was written for: the result of a sign-only comparison (Kotlin `compareTo`/`compare`/`compareValues`, TypeScript and JavaScript `localeCompare`) compared with a value other than 0 (`== 1`, `== -1`, `> 1`; Java keeps Error Prone `CompareToZero`), and an index search (`indexOf`/`lastIndexOf`, Python `find`/`rfind`) tested with `> 0`, `>= 1`, `<= 0` or `< 1`, which misses a match at position 0 (Java reports it for lists and sets whose declared type is known; SpotBugs `RV_CHECK_FOR_POSITIVE_INDEXOF` keeps `String`)',
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
