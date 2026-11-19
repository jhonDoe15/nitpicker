const FIX_TEXT = '{fix}';
const STRUCTURE_TOOL = 'structure';

const DOUBLE_NUMBERS =
  'every number is a double and never wraps: there is no wrapping difference and no smallest value whose `Math.abs` stays negative, which are the shapes the rule proves';
const UNBOUNDED_INTEGERS =
  'integers have no fixed width and never overflow: there is no wrapping difference and no smallest value whose `abs` stays negative, which are the shapes the rule proves';

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
    decidedCondition: `\`{condition}\` is always {verdict} here: {reason}{consequence}. ${allowed(FIX_TEXT)} ${exceptionHint}`,
    duplicateBranch: `{subject}. ${allowed(FIX_TEXT)} ${exceptionHint}`,
    resultSlip: `{subject}. ${allowed(FIX_TEXT)} ${exceptionHint}`,
    integerSlip: `{subject}. ${allowed(FIX_TEXT)} ${exceptionHint}`,
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
        'an `if`, `while`, `when` arm, ternary or `&&`/`||` operand in a production function that the guards before it decide, proved by a solver (Z3, fixed resource limit): enclosing `if`s and their `else`, guard clauses that return, throw, break or continue, earlier `when` arms, the arms of a `switch`, `when (subject)` or `match` (the label in its own arm, every earlier label excluded in `default`/`else`, nothing for fall-through, pattern or guarded arms) and a `case` label the facts before the switch rule out, precondition calls and asserts matched by their import (`Objects.requireNonNull`, Guava `Preconditions`, Spring `Assert`, commons-lang `Validate`, Kotlin `require`/`check`/`requireNotNull`, `node:assert`, project `asserts` functions; a Java, Kotlin or Python `assert` may be switched off at run time, so it only reports a check as redundant, never code as dead), the left side of `&&`/`||`, a coercion of the tested value that the same guards settle (`Boolean.TRUE.equals(x)` under `if (x != null && x)`, Kotlin `x == true` under `if (x == true)`, Python `bool(x)` under `if x:`, TypeScript `Boolean(x)` or `!!x` under `if (x)`), the test of a counted loop (Java and TypeScript `for`, Python `range`, Kotlin `until`, `..` and `downTo`), the branches of a ternary or `if` expression, and facts about names a lambda captures when they cannot change; Java and Kotlin `equals` and `Objects.equals` against a string, boolean or enum constant count as `==`; sizes and lengths (Go `len` and `cap` too; whole numbers, never negative, `isEmpty()` meaning a size of 0), index searches (at least -1; Go `strings`/`bytes`/`slices` `Index` functions and Python `str.find`/`rfind` too), absolute values of floating-point numbers and `Math.random()` are known by the declared types of their receivers (TypeScript: the type checker), a same-file getter that only returns a field and a known pure library method return the same value until something changes, never for a volatile field, a Kotlin property with a custom getter or delegate, or a TypeScript accessor or property the type checker does not show as plain data, which are new values at every read; `==` on Java references, Kotlin `===` and Python `is` (except `is None`) are identity tests that never relate to equality; a collection type counts only when it resolves to the library type; the smaller or larger of two integers (`Math.min`/`max`, `minOf`/`maxOf`, Python `min`/`max`) is known, a call of a same-file function that cannot be overridden (Java `private`/`static`/`final`, a TypeScript or Python module function) and only returns a side-effect-free condition is read as that condition, through at most 2 levels, and the message names the helper; a declaration or plain assignment of a literal (or of a local of an exact type) to a local, until the next write to it; a write to a name, or a call that is not pure, forgets what was known about it; Java and Kotlin `int`/`long` arithmetic, Go integer arithmetic of every width (`int` is 64 bits, nothing is promoted, unsigned types wrap) and Python integer sums, differences and products are exact to the solver (fixed-width integers wrap around on overflow), other arithmetic is an opaque value; in Go, a name whose address is taken, or that a method is called on, counts as changeable by any call and `if err != nil` tells only about `err`; TypeScript and JavaScript report it as `nitpicker/no-decided-condition`',
    },
    {
      id: ids.duplicateBranch,
      check: STRUCTURE_TOOL,
      limit:
        "two arms of an `if`/`else if` chain, a ternary, a `switch`, a `select` or a `when` in a production function whose bodies have the same canonical tree (the near-duplicate engine's rewrites, renamed locals of the arm count as equal, other names and literals must match; a `switch` case that falls through, or that a non-empty case falls into, and an arm picked by a type test are not compared); report-only: the same statements at the start or end of every arm of a complete `if` chain or `when`, when moving them keeps behaviour; adjacent `if` guards without `else` that share one body ending in `return`, `throw`, `break` or `continue`, when the later conditions only read (merged into `if (a || b)`); an `if (a)` whose only statement is an `if`/`else` that repeats the outer `else` (as `if (a && b)` or `if (a && !b)`). Error Prone `DuplicateBranches` keeps the Java two-arm `if`/`else` and ternary, Ruff `SIM114` the adjacent Python `if`/`elif` arms, and revive `identical-branches` (go-critic `dupBranchBody`, left out of the preset for it), `identical-ifelseif-branches` and `identical-switch-branches` the Go arms and cases with the same body (Go `select` cases are still compared here)",
    },
    {
      id: ids.resultSlip,
      check: STRUCTURE_TOOL,
      limit:
        'a comparison in a production function that cannot test what it was written for: the result of a sign-only comparison (Kotlin `compareTo`, `compareValues` and `compare` on a declared `Comparator`, never a project function named `compare`; TypeScript and JavaScript `localeCompare`, `Intl.Collator#compare` and a declared `(a, b) => number` comparator named like `compare`, `comparator` or `cmp`) compared with a value other than 0 (`== 1`, `== -1`, `> 1`; Java keeps Error Prone `CompareToZero`), and an index search (`indexOf`/`lastIndexOf`, Python `find`/`rfind`, Go `strings`/`bytes`/`slices` `Index`, `IndexByte`, `IndexRune`, `IndexAny`, `IndexFunc` and the `Last` forms; the Go `Compare` functions return exactly -1, 0 or 1) tested with `> 0`, `>= 1`, `<= 0` or `< 1`, which misses a match at position 0 (Java reports it for lists and sets whose declared type is known, SpotBugs `RV_CHECK_FOR_POSITIVE_INDEXOF` keeps `String`; the other presets also report strings; none reports it when the function reads the first element or tests the same search `== 0`)',
    },
    {
      id: ids.integerSlip,
      check: STRUCTURE_TOOL,
      limit:
        'Java, Kotlin and Go integer arithmetic that a solver shows wrong for some input, with the guards before it known (`int`/`long` are fixed-width and overflow, sizes are bounded): a difference compared with 0 by order (never `==`/`!=`, which wrapping cannot change; Go unsigned integers wrap too) or returned from `compareTo`/`compare` (it overflows, use `Integer.compare`), `Math.abs` of an `int` or `long` (`byte`, `short` and `char` promote) used as an index or a `%` bucket (the smallest value stays negative; Go `math.Abs` is a float function and has no such slip), and in Kotlin and Go a `%` result compared with a positive value for a parameter that can be negative (Java keeps SpotBugs `IM_BAD_CHECK_FOR_ODD`); only operands that are parameters never reassigned, fields and calls are probed, a local has no known range and is skipped; the message names the inputs; Go integers are read at their declared width (`int` is 64 bits)',
      notApplicable: {
        typescript: DOUBLE_NUMBERS,
        javascript: DOUBLE_NUMBERS,
        python: UNBOUNDED_INTEGERS,
      },
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
