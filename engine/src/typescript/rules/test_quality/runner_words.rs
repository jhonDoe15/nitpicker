//! The words of `runnerVocabulary` a rule writes into its message, given for the file as `<rule>.<word>` settings by
//! the caller, which knows the project's test runner. Without a setting, the words of the default runner, Vitest.
use crate::typescript::rules::Context;

const VITEST: &[(&str, &str)] = &[
    ("each-case", "give each case its own test with it.each"),
    ("shared-setup-hook", "beforeAll"),
    ("poll-instead", "vi.waitFor / expect.poll"),
    ("whole-output", "`toEqual` or `toBe`"),
    ("fragment-forms", "`toContain`, or `toMatch` with a pattern that is not anchored `^...$`"),
    ("whole-value", "`toEqual`"),
    ("partial-forms", "`toMatchObject`, `expect.objectContaining`, `expect.stringContaining`, `expect.arrayContaining`"),
    ("varied-field", "Use `expect.any(Type)` for a field that varies."),
    ("wait-on-condition", "vi.waitFor or expect.poll"),
    ("advance-fake-time", "vi.advanceTimersByTime"),
    ("fake-clock", "`vi.useFakeTimers()` and `vi.setSystemTime(...)`"),
    ("fix-random", "`vi.spyOn(Math, \"random\")`"),
    ("collect-it", "Rename it `*.test.ts` (or `*.spec.ts`)."),
];

/// The runner's word for `word` in messages of `rule`.
pub fn runner_word<'c>(context: &'c Context, rule: &str, word: &str) -> &'c str {
    let fallback = VITEST.iter().find(|(name, _)| *name == word).map_or("", |(_, text)| *text);
    context.setting(&format!("{rule}.{word}")).unwrap_or(fallback)
}
