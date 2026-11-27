//! Which Error Prone checks that the engine does not run can report in a file. Each check has a precondition,
//! written from its matchers in Error Prone 2.50.0, that holds whenever Error Prone could report it in the file; it may
//! hold more often. A Java run starts Error Prone only for the files and checks where a precondition holds.
//!
//! A check matched on a class by its name needs the class on the class path or in the sources, since javac loads it
//! there. An annotation that Error Prone looks for by name on a member of a class file is different: javac keeps the
//! annotation even when its class is not on the class path, so such checks can report in any file.
use crate::java::types::index::TypeIndex;

pub enum Gate {
    /// Reports only in a compile with `-XepCompilingForAndroid` or similar, which a Java run never passes.
    Android,
    /// Can report in any file.
    Always,
    /// One of the classes is on the class path or in the sources.
    Types(&'static [&'static str]),
    /// The file holds one of the words, or one of the symbols.
    Text(&'static [&'static str]),
    /// Every gate holds.
    All(&'static [Gate]),
}

const SWITCH: Gate = Gate::Text(&["switch"]);
const INSTANCEOF: Gate = Gate::Text(&["instanceof"]);
const ANNOTATED: Gate = Gate::Text(&["@"]);
const COMPARED: Gate = Gate::Text(&["==", "!="]);
const NULL: Gate = Gate::Text(&["null"]);
const TRY: Gate = Gate::Text(&["try"]);
const CHRONO_FIELDS: &[&str] = &[
    "NANO_OF_SECOND", "NANO_OF_DAY", "MICRO_OF_SECOND", "MICRO_OF_DAY", "MILLI_OF_SECOND", "MILLI_OF_DAY",
    "SECOND_OF_MINUTE", "SECOND_OF_DAY", "MINUTE_OF_HOUR", "MINUTE_OF_DAY", "HOUR_OF_AMPM", "CLOCK_HOUR_OF_AMPM",
    "HOUR_OF_DAY", "CLOCK_HOUR_OF_DAY", "AMPM_OF_DAY", "DAY_OF_WEEK", "ALIGNED_DAY_OF_WEEK_IN_MONTH",
    "ALIGNED_DAY_OF_WEEK_IN_YEAR", "DAY_OF_MONTH", "DAY_OF_YEAR", "EPOCH_DAY", "ALIGNED_WEEK_OF_MONTH",
    "ALIGNED_WEEK_OF_YEAR", "MONTH_OF_YEAR", "PROLEPTIC_MONTH", "YEAR_OF_ERA", "YEAR", "ERA", "INSTANT_SECONDS",
    "OFFSET_SECONDS",
];

/// The checks of Error Prone 2.50.0 that Java runs enable and the engine does not run, with their preconditions.
pub const PRECONDITIONS: &[(&str, Gate)] = &[
    ("BinderIdentityRestoredDangerously", Gate::Android),
    ("BundleDeserializationCast", Gate::Android),
    ("IsLoggableTagLength", Gate::Android),
    ("MislabeledAndroidString", Gate::Android),
    ("ParcelableCreator", Gate::Android),
    ("RectIntersectReturnValueIgnored", Gate::Android),
    ("DeeplyNested", Gate::Always),
    ("SunApi", Gate::Always),
    ("UnsafeWildcard", Gate::Always),
    ("IncompatibleArgumentType", Gate::Always),
    ("InlineMeInliner", Gate::Always),
    ("FormatString", Gate::Always),
    ("FormatStringAnnotation", Gate::Always),
    ("NullArgumentForNonNullParameter", Gate::Always),
    ("Immutable", Gate::Always),
    ("FloggerFormatString", Gate::Types(&["com.google.common.flogger.LoggingApi"])),
    ("MutableGuiceModule", Gate::Types(&["com.google.inject.AbstractModule"])),
    ("StaticMockMember", Gate::Types(&["org.mockito.Mock"])),
    (
        "TruthAssertExpected",
        Gate::Types(&[
            "com.google.common.truth.Truth",
            "com.google.common.truth.extensions.proto.ProtoTruth",
            "com.google.common.truth.StandardSubjectBuilder",
        ]),
    ),
    ("UseBinds", Gate::Types(&["dagger.Provides", "dagger.producers.Produces"])),
    ("AutoValueBoxedValues", Gate::Types(&["com.google.auto.value.AutoValue"])),
    (
        "MisformattedTestData",
        Gate::Types(&[
            "com.google.errorprone.CompilationTestHelper",
            "com.google.errorprone.BugCheckerRefactoringTestHelper",
        ]),
    ),
    ("ASTHelpersSuggestions", Gate::Types(&["com.google.errorprone.util.ASTHelpers"])),
    ("RestrictedApi", Gate::Types(&["com.google.errorprone.annotations.RestrictedApi"])),
    ("StatementSwitchToExpressionSwitch", SWITCH),
    ("RefactorSwitch", SWITCH),
    ("BadInstanceof", INSTANCEOF),
    ("NewFileSystem", Gate::Text(&["newFileSystem"])),
    (
        "InvalidPatternSyntax",
        Gate::Text(&[
            "matches", "split", "replaceFirst", "replaceAll", "compile", "onPattern", "doesNotMatch", "containsMatch",
            "doesNotContainMatch",
        ]),
    ),
    ("OrphanedFormatString", Gate::Text(&["%", "\\45", "\\045"])),
    ("TemporalAccessorGetChronoField", Gate::All(&[Gate::Text(&["get", "getLong"]), Gate::Text(CHRONO_FIELDS)])),
    ("AlwaysThrows", Gate::Text(&["put", "of", "parse", "fromHex", "fromString", "plus", "minus"])),
    ("FloatingPointAssertionWithinEpsilon", Gate::Text(&["isWithin", "isNotWithin", "assertEquals", "of"])),
    ("ModifySourceCollectionInStream", Gate::Text(&["stream", "parallelStream"])),
    ("EqualsBrokenForNull", Gate::Text(&["equals"])),
    ("RedundantNullCheck", NULL),
    ("ReturnsNullCollection", NULL),
    ("InlineMeValidator", Gate::Text(&["InlineMe"])),
    ("MissingFail", TRY),
    ("TryFailRefactoring", TRY),
    ("AssertThrowsMinimizer", Gate::Text(&["assertThrows"])),
    ("RecordComponentAccessorAnnotationConflict", Gate::Text(&["record"])),
    ("TypeNameShadowing", Gate::Text(&["<"])),
    ("ReferenceEquality", COMPARED),
    ("OptionalEquality", COMPARED),
    ("MemorySegmentReferenceEquality", COMPARED),
    ("UnnecessaryMethodReference", Gate::Text(&["::"])),
];

fn identifier_part(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '$'
}

fn has_word(text: &str, word: &str) -> bool {
    text.match_indices(word).any(|(at, _)| {
        let before = text[..at].chars().next_back().is_none_or(|character| !identifier_part(character));
        let after = text[at + word.len()..].chars().next().is_none_or(|character| !identifier_part(character));
        before && after
    })
}

/// A word is matched whole, a symbol anywhere. A unicode escape can spell any word, so a file with one holds them all.
fn has_any(text: &str, entries: &[&str]) -> bool {
    text.contains("\\u")
        || entries.iter().any(|entry| {
            if entry.starts_with(|first: char| first.is_ascii_alphabetic()) {
                has_word(text, entry)
            } else {
                text.contains(entry)
            }
        })
}

fn holds(gate: &Gate, text: &str, index: &TypeIndex) -> bool {
    match gate {
        Gate::Android => index.android_compatible,
        Gate::Always => true,
        Gate::Types(names) => names.iter().any(|name| index.has(name)),
        Gate::Text(entries) => has_any(text, entries),
        Gate::All(gates) => gates.iter().all(|gate| holds(gate, text, index)),
    }
}

/// The checks of the list that may report in the file; a check without a precondition may report anywhere.
pub fn may_report(checks: &[&str], text: &str, index: &TypeIndex) -> Vec<String> {
    checks
        .iter()
        .filter(|check| {
            PRECONDITIONS.iter().find(|(name, _)| name == *check).is_none_or(|(_, gate)| holds(gate, text, index))
        })
        .map(|check| check.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_match_whole_and_symbols_anywhere() {
        assert!(has_any("x = switch (y) {", &["switch"]));
        assert!(!has_any("int switcher = 1; mySwitch();", &["switch"]));
        assert!(!has_any("String$switch", &["switch"]));
        assert!(has_any("a != b", &["==", "!="]));
        assert!(has_any("s\\u0077itch", &["instanceof"]));
        assert!(has_any("\"\\045d\"", &["%", "\\45", "\\045"]));
        assert!(!has_any("\"\\45d\" no", &["\\045"]));
    }

    fn names(json: &serde_json::Value, key: &str) -> Vec<String> {
        json[key].as_array().expect("list").iter().map(|name| name.as_str().expect("name").to_string()).collect()
    }

    /// Every check a Java run enables and the engine does not run has a precondition, and each precondition is for
    /// an enabled check.
    #[test]
    fn every_check_left_to_error_prone_has_a_precondition() {
        let checks: serde_json::Value =
            serde_json::from_str(include_str!("../../../../languages/java/gradle/errorprone/checks.json"))
                .expect("json");
        let ported: Vec<String> =
            serde_json::from_str(include_str!("../../../../languages/java/gradle/errorprone/engine-checks.json"))
                .expect("json");
        let off: Vec<String> = [names(&checks, "defaultOff"), names(&checks, "disable")].concat();
        let enabled: Vec<String> =
            names(&checks, "reviewedChecks").into_iter().filter(|name| !off.contains(name)).collect();
        let missing: Vec<&String> = enabled
            .iter()
            .filter(|name| !ported.contains(name) && !PRECONDITIONS.iter().any(|(check, _)| check == name))
            .collect();
        assert!(missing.is_empty(), "no precondition: {missing:?}");
        let unknown: Vec<&str> = PRECONDITIONS
            .iter()
            .map(|(check, _)| *check)
            .filter(|check| !enabled.iter().any(|name| name == check))
            .collect();
        assert!(unknown.is_empty(), "not enabled: {unknown:?}");
    }

    #[test]
    fn each_check_has_one_precondition() {
        let mut names: Vec<&str> = PRECONDITIONS.iter().map(|(name, _)| *name).collect();
        names.sort_unstable();
        let count = names.len();
        names.dedup();
        assert_eq!(names.len(), count);
    }
}
