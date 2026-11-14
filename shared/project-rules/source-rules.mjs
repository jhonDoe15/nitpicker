const STRUCTURE_TOOL = 'structure';

export const SOURCE_RULE_IDS = {
  componentStoryMissing: 'component-story-missing',
  javascriptInTypescriptProject: 'javascript-in-typescript-project',
  decidedCondition: 'decided-condition',
  duplicateBranch: 'duplicate-branch',
  resultSlip: 'result-slip',
  integerSlip: 'integer-slip',
  shorterCondition: 'shorter-condition',
};

export function sourceRuleMessages(exceptionHint, allowed) {
  return {
    componentStoryMissing: `Most components in this project have a story. ${allowed('Add {story} for {name}.')} ${exceptionHint}`,
    componentStoryMissingUnenforced: `{name} has no story. ${allowed('Add {story}.')} Not enforced until more than half of the components have one. ${exceptionHint}`,
    decidedCondition: `\`{condition}\` is always {verdict} here: {reason}{consequence}. ${allowed('{fix}')} ${exceptionHint}`,
    duplicateBranch: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    resultSlip: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    integerSlip: `{subject}. ${allowed('{fix}')} ${exceptionHint}`,
    shorterCondition: `\`{condition}\` can be written as \`{form}\`: {reason}. ${allowed('Write {form}.')} ${exceptionHint}`,
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
        'an `if`, `while`, `when` arm, ternary or `&&`/`||` operand in a production function that the guards before it decide, proved by a solver (Z3, fixed resource limit): enclosing `if`s and their `else`, guard clauses that return, throw, break or continue, earlier `when` arms, the arms of a `switch`, `when (subject)` or `match` (the label in its own arm, every earlier label excluded in `default`/`else`, nothing for fall-through, pattern or guarded arms) and a `case` label the facts before the switch rule out, precondition calls and asserts matched by their import (`Objects.requireNonNull`, Guava `Preconditions`, Spring `Assert`, commons-lang `Validate`, Kotlin `require`/`check`/`requireNotNull`, `node:assert`, project `asserts` functions; an `assert` only removes redundant checks), the left side of `&&`/`||`, the test of a counted loop (Java and TypeScript `for`, Python `range`, Kotlin `until`, `..` and `downTo`), the branches of a ternary or `if` expression, and facts about names a lambda captures when they cannot change; Java and Kotlin `equals` and `Objects.equals` against a string, boolean or enum constant count as `==`; sizes and lengths (whole numbers, never negative, `isEmpty()` meaning a size of 0), index searches (at least -1), absolute values of floating-point numbers and `Math.random()` are known by the declared types of their receivers (TypeScript: the type checker), a same-file getter that only returns a field and a known pure library method return the same value until something changes, a call of a same-file function that cannot be overridden (Java `private`/`static`/`final`, a TypeScript or Python module function) and only returns a side-effect-free condition is read as that condition, through at most 2 levels, and the message names the helper; a declaration or plain assignment of a literal (or of a local of an exact type) to a local, until the next write to it; a write to a name, or a call that is not pure, forgets what was known about it; Java and Kotlin `int`/`long` arithmetic and Python integer sums, differences and products are exact to the solver (JVM integers wrap around on overflow), other arithmetic is an opaque value; TypeScript and JavaScript report it as `nitpicker/no-decided-condition`',
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
    {
      id: ids.integerSlip,
      check: STRUCTURE_TOOL,
      limit:
        'Java and Kotlin integer arithmetic that a solver shows wrong for some input, with the guards before it known (`int`/`long` are fixed-width and overflow, sizes are bounded): a difference compared with 0 or returned from `compareTo`/`compare` (it overflows, use `Integer.compare`), `Math.abs` of an `int` or `long` used as an index or a `%` bucket (the smallest value stays negative), and in Kotlin a `%` result compared with a positive value for a parameter that can be negative (Java keeps SpotBugs `IM_BAD_CHECK_FOR_ODD`); the message names the inputs; TypeScript numbers are doubles and Python integers are unbounded, so neither has these slips',
    },
    {
      id: ids.shorterCondition,
      check: STRUCTURE_TOOL,
      limit:
        'an `&&`/`||` condition in a production function with at most 6 distinct operands, all without effects and unable to fail, that has an equivalent form with fewer operands, proved by a truth table or a solver (Z3, fixed resource limit): an operand that a later operand of the same `&&` implies (or that implies a later one of an `||`), two operands that merge (complement, absorption, adjacent or overlapping ranges on one value); printed from the original operands in their order; an operand that guards a later one (a null check before a member read, bounds before an index), a float comparison is never rewritten into its opposite, an operand that the operands before it decide (`decided-condition`) and a non-boolean operand outside a condition are left alone; TypeScript and JavaScript report it as `nitpicker/shorter-boolean-logic`. PMD, detekt and Ruff have no equivalent: PMD `SimplifyBooleanExpressions` and Ruff `SIM222`/`SIM223` only see boolean literals, Ruff `PLR1714` merges repeated equality tests',
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
