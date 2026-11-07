# Decisions

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

Status: Proposed, pending owner review. Each answer is a recommendation for the owner to accept or
change in review.

## zod: peer dependency or documented expectation

Recommendation: documented expectation, not a peer dependency.

The preset only requires that adapter code parse untrusted input with a schema library, and zod is
the default. Nitpicker's own runtime never imports zod (it is not in `package.json`), so a peer
dependency would make every consumer install a package nitpicker does not use, and would break
installs for projects that choose to have no external-input boundary. The rule that checks this
works on syntax (a hand-written type guard on external data, an unparsed `JSON.parse`) and on which
calls count as a parse, not on importing the library. Document in the preset README that adapters
are expected to use zod unless the project has another validation library, and have the rule
message name the project's library, or zod when it has none (see "Libraries follow the project").
Revisit as a peer dependency (optional, via `peerDependenciesMeta`) only if a rule needs to import
from zod at lint time.

## Does nitpicker's own code follow the preset

Recommendation: not now. Follow the preset for new nitpicker code only after the port is complete,
and do not rewrite the engine.

Measured cost, from `core` and `languages/typescript/preset` (non-test `.mjs`, about 7,300 lines):
the engine uses `let`, `for` loops and `while (pending.pop())` graph walks in roughly 180 places,
classes are rare, and the code is plain `.mjs` without TypeScript, so the type-based rules (`as`,
`any`, discriminated-union exhaustiveness) cannot apply at all. Porting it would be a large rewrite
with no user-visible benefit, and graph walks written without loops or recursion are harder to read.
Applied in S13: nitpicker's own sources are not rewritten and no config is added for them. A cheaper and honest path is the one the differential gate already provides: run nitpicker on
itself, with existing violations baselined, so any new or touched engine code must comply once the
preset runs on TypeScript sources. The layout (`src/main/features/...`) does not match the current
`core/` and `languages/typescript/preset/` directories, so the repo needs either a layout override (an exception in its
own config, visible in the report) or a move; choose the override until the engine is TypeScript.

## How existing consumers upgrade

Recommendation: strict replaces the current rules in a single release, adopted through the baseline.

1. Ship the strict preset as a new major version, with a changelog listing every rule that fails.
2. The policy hash changes with the preset. The gate analyzes both the base worktree and the head
   (`core/diff/comparison/run-diff.mjs`), so existing violations appear on both sides and are baselined, not
   failed. The upgrade PR itself should be verified once to confirm the base side is analyzed with
   the new rules (checked in S13: the base side is analyzed with the head's policy, and a test shows a legacy
   violation staying baselined when the edit is elsewhere in the file).
3. Violations in files a PR does not touch stay baselined and never block it. Violations in touched
   code are enforced (see the next decision), so adoption is gradual and driven by ordinary edits.
4. Teams that cannot adopt a rule yet add an exception in the nitpicker config file, which changes
   the policy hash and appears in the report. There is no separate "legacy" preset.

## How touched code is detected and held to strict rules

Today the gate classifies a finding as new only when its comparison key is missing from the base.
The key (`core/diff/comparison/fingerprint.mjs`) is tool, rule, rename-mapped path, symbol,
identity, classification and metric name. It contains no line number, so an existing violation in an
edited file keeps matching the base and stays baselined. That is the behavior to change for strict.

Recommendation: line-hunk promotion, implemented in the diff engine (folded into S13 and
implemented there: `readChangedLines` in `core/diff/git/repository/git.mjs`, applied by `compareFindings` in
`core/diff/comparison/compare.mjs`, with the rule set from `languages/typescript/preset/strict-rules.mjs`).

- Compute the changed line ranges of each file on the head side from
  `git diff --unified=0 --find-renames <base>...HEAD` (the engine already shells out to git in
  `core/diff/git/repository/git.mjs` for renames; hunk headers `@@ -a,b +c,d @@` give the head ranges `c..c+d-1`).
- After `compareFindings`, move a finding from `unchangedFindings` to `newFindings` when its rule
  is in the strict set and its head `location.line` falls inside a changed range of its file.
  Findings with no `location` (file- or graph-level findings) are promoted only when the file is
  newly added, not merely edited, to avoid blocking on whole-file metrics.
- A pure rename or move without content changes has no hunks, so rename-stable fingerprints still
  baseline it. A line whose only change is formatting (a Prettier run: whitespace, line breaks,
  quotes, semicolons, trailing commas, arrow parentheses), or that git shows as deleted and
  re-added because code went in above it, is not a changed line (see "Changed lines" in
  `docs/internals.md`), so running the formatter over a legacy file does not promote its findings.
- Scope is rule-level, not tool-wide: only rules marked `strict` in the preset promote, so
  descriptive metrics (CRAP, duplication) keep their delta logic.

Edited legacy lines are judged "only if worse". A strict finding inside a named function carries a
count ratchet (how many times its rule and message fire in that function). When such a finding sits
on a line the change edited but did not add (the first lines of a hunk, up to the number of lines it
replaced), it is not promoted: it stays baselined while the function has no more of that violation
than on the base, and fails once the count rises. Lines the change added, and every line of a new
file, stay fully strict. Formatting is the exception: `prettier/prettier` is strict on every edited
line (`mustMeetOnEditedLines` in `strict-rules.mjs`).
A finding that fails in a function whose base already had findings of the same rule and kind can carry
`ratchet.growthAdvice`; the report appends it to the message with `{base}` replaced by the base count.
`nitpicker/no-throw` uses it to say a new failure can go through an existing throw statement.

Prettier findings use the same promotion: the formatter reports one finding per differing region
(identity from the region's own text, `location.line` to `location.endLine` in the head file), and
`isStrictRule` includes `prettier/prettier`, so a legacy unformatted region stays baselined until an
edit overlaps it.

Rejected alternatives: whole-file promotion (a one-line edit in a large legacy file would force a
large cleanup and discourage small fixes); function-level promotion using symbols (more precise but
requires every analyzer to report symbol ranges, which they do not today). Function-level can replace
hunk-level later behind the same interface if line hunks prove too coarse.
