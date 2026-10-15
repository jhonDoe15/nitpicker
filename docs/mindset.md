# Mindset

How nitpicker decides what to enforce. Read this before adding, loosening or removing a rule.

## The purpose

Flexible languages let code be written many ways. Coding agents use all of them and repeat the
same mistakes. nitpicker narrows each language to roughly one allowed way of doing each thing, so
the quickest way to a green build is also the right way. A rule earns its place when it blocks a
pattern agents (or people) produce that makes code wrong, slow, fragile or hard to review, and when
the allowed alternative is clear.

## "Noisy" is not a reason to turn a rule off

Other linters leave many rules out of their defaults because they are called noisy: they flag code
that is sometimes legitimate, they encode a choice, or they are about performance rather than
correctness. Those rules are often exactly the ones nitpicker exists for. Saving one entity per
loop iteration, missing optimistic locking, IDENTITY ids that disable batching, broad or swallowed
catches, deep nesting, magic values, fire-and-forget async and tests that sleep are all called
noisy somewhere. They are also the patterns agents produce most, and none of them is a style
preference.

So a rule's default is decided by what it prevents, not by how often other teams disable it:

1. **On by default.** The message names the allowed form, in one or two sentences.
2. **Can flag legitimate code?** It stays on, and its message says how to add a reviewed
   exception in `nitpicker.config.json` (rule, paths, reason). Every exception shows in the report.
3. **Flags legitimate code often?** Make the rule narrower and more precise, so it still blocks the
   bad shape (for example: a repository call inside a loop, not every call inside a loop).
4. **Off, or report-only, only when the noise is structural**: the tool cannot know the answer
   and no exception could make the finding right, such as equivalent mutants or generated code.
   Write the reason down where the rule is configured.

When in doubt, keep the rule on and make the exception easy to find.

## Exceptions are explicit and reviewed

- An exception lives in `nitpicker.config.json`, with paths and a reason, where review sees it.
- Inline suppressions (`eslint-disable`, `// NOPMD`, `@SuppressWarnings("PMD")`, coverage or
  mutation ignore comments) are not an exception route: they hide the decision in the diff. The
  rare per-location case is a named marker for one rule (native SQL in a Spring Data repository).
- A project's own tool configuration never silently switches nitpicker's rules off. Using the
  project's config for a tool is an explicit, per-tool opt-in.

## One way lives in the code, not the tooling

The allowed way is about code and architecture. Which test runner, build tool or framework version
a project uses is not: nitpicker supports the common options and moves toward the preferred one
over time, so adopting it on an existing project is never blocked by tooling. For the same reason,
rules target code shape, not framework versions.

## Clear over clever

Prefer the slightly more verbose form when it is clearer and less complex: an explicit `@Query`
with JPQL over a query derived from a method name, a named constant over a repeated literal, a new
function over another branch in an old one.

## Tests are fast, and mostly unit tests

- Most tests, by count, are unit tests that run in milliseconds, so a project's suite stays fast.
  Slow or over-complex test and CI patterns count as slop too.
- State and logic are separated, by class or at least by method, so logic is tested without
  starting anything.
- Tests that start an application context, a database or a server (for example `@SpringBootTest`)
  are integration or component tests, and live in their own package or folder.
- A test that cannot fail is worse than no test: no sleeps, no conditional assertions, no
  assertion-free tests, no partial matches where the whole value can be pinned.

## People must want to use it

- Only problems a change adds fail. Existing problems are recorded and left alone, and a function
  that was already over a limit may be edited as long as it does not get worse.
- Every message is short and says what to do. A rule that can flag legitimate code says how to add
  the exception.
- The skill teaches agents the allowed way before they write code; the gate is the backstop, not
  the teacher.

## Our own code, and other people's

- Code we write or copy is under a permissive license. A tool we run unmodified, downloaded at run
  time or installed as an unmodified npm package, may be weak-copyleft (LGPL, EPL, MPL): SpotBugs,
  find-sec-bugs, Checkstyle, JaCoCo and axe-core are. GPL, AGPL and source-available licenses
  (SSPL, SSALv1, BSL, Elastic) never are, so SonarJS and SonarJava, and OpenRewrite's Spring
  recipes, are not used, and their implementations are not read when we write similar rules. A test
  checks every dependency (see [CONTRIBUTING.md](../CONTRIBUTING.md#licenses)).
- Ideas from MIT-licensed projects (for example Taikai's ArchUnit rules) are welcome when they fit
  this mindset, with credit.
