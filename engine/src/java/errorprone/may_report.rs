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
    /// javac's tree of the file may nest deeper than `DeeplyNested`'s default limit of 1000 levels.
    Deep,
    /// The file holds a name that a call to a method or constructor with an annotation named `InlineMe` spells.
    Inlined,
}

/// The most javac tree levels that one level of the parse tree stands for: a parse node is at most a javac node with
/// a synthetic child and grandchild (an enum constant is a variable, its `new` and its class body).
const JAVAC_LEVELS_PER_NODE: usize = 3;

/// `DeeplyNested` reports a node at javac depth 1001 that scans a child, its default `MaxDepth` being 1000.
const DEEPLY_NESTED: usize = 1000;

/// The tokens of the `dimensions` nodes that are children of the node, or of its declarators. javac wraps the
/// element type in one array type per bracket pair (and an annotated type per annotation), while the parse keeps the
/// brackets flat beside the type, also when a declarator or a method carries them (`A<B> x[][]`, `int f()[]`).
fn brackets(node: tree_sitter::Node) -> usize {
    let mut cursor = node.walk();
    node.children(&mut cursor)
        .map(|child| match child.kind() {
            "dimensions" => child.child_count() as usize,
            "variable_declarator" => {
                let mut inner = child.walk();
                child.children(&mut inner).filter(|part| part.kind() == "dimensions").map(|part| part.child_count() as usize).sum()
            }
            _ => 0,
        })
        .sum()
}

/// The deepest nesting of the parse tree, where the children of a node sit below its brackets (see `brackets`).
fn parse_depth(root: tree_sitter::Node) -> usize {
    let mut deepest = 0;
    let mut stack: Vec<(tree_sitter::Node, usize)> = vec![(root, 0)];
    while let Some((node, above)) = stack.pop() {
        let depth = above + 1 + brackets(node);
        deepest = deepest.max(depth);
        let mut cursor = node.walk();
        stack.extend(node.children(&mut cursor).map(|child| (child, depth)));
    }
    deepest
}

const SWITCH: Gate = Gate::Text(&["switch"]);
const INSTANCEOF: Gate = Gate::Text(&["instanceof"]);
const COMPARED: Gate = Gate::Text(&["==", "!="]);
const NULL: Gate = Gate::Text(&["null"]);
const TRY: Gate = Gate::Text(&["try"]);

/// The checks of Error Prone 2.50.0 that Java runs enable and the engine does not run, with their preconditions.
pub const PRECONDITIONS: &[(&str, Gate)] = &[
    ("BinderIdentityRestoredDangerously", Gate::Android),
    ("BundleDeserializationCast", Gate::Android),
    ("IsLoggableTagLength", Gate::Android),
    ("MislabeledAndroidString", Gate::Android),
    ("ParcelableCreator", Gate::Android),
    ("RectIntersectReturnValueIgnored", Gate::Android),
    ("DeeplyNested", Gate::Deep),
    ("UnsafeWildcard", Gate::Always),
    ("IncompatibleArgumentType", Gate::Always),
    ("InlineMeInliner", Gate::Inlined),
    ("NullArgumentForNonNullParameter", Gate::Always),
    ("Immutable", Gate::Always),
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
    ("EqualsBrokenForNull", Gate::Text(&["equals"])),
    ("RedundantNullCheck", NULL),
    ("ReturnsNullCollection", NULL),
    ("InlineMeValidator", Gate::Text(&["InlineMe"])),
    ("MissingFail", TRY),
    ("TryFailRefactoring", TRY),
    ("AssertThrowsMinimizer", Gate::Text(&["assertThrows"])),
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

fn holds(gate: &Gate, text: &str, root: tree_sitter::Node, index: &TypeIndex) -> bool {
    match gate {
        Gate::Deep => root.has_error() || parse_depth(root) * JAVAC_LEVELS_PER_NODE > DEEPLY_NESTED,
        Gate::Inlined => {
            let names = index.inline_me_names();
            index.manifest_paths || (!names.is_empty() && (text.contains("\\u") || names.iter().any(|name| has_word(text, name))))
        }
        Gate::Android => index.android_compatible,
        Gate::Always => true,
        Gate::Types(names) => names.iter().any(|name| index.has(name)),
        Gate::Text(entries) => has_any(text, entries),
    }
}

/// The checks of the list that may report in the file; a check without a precondition may report anywhere.
pub fn may_report(checks: &[&str], text: &str, root: tree_sitter::Node, index: &TypeIndex) -> Vec<String> {
    checks
        .iter()
        .filter(|check| {
            PRECONDITIONS.iter().find(|(name, _)| name == *check).is_none_or(|(_, gate)| holds(gate, text, root, index))
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

    fn depth(text: &str) -> usize {
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&tree_sitter_java::LANGUAGE.into()).expect("grammar");
        parse_depth(parser.parse(text, None).expect("tree").root_node())
    }

    #[test]
    fn array_brackets_nest_and_long_chains_are_deep() {
        let flat = depth("class A { int x; }");
        assert!(depth(&format!("class A {{ int{} x; }}", "[]".repeat(20))) >= flat + 20);
        let generic = format!("class A {{ {}String{} f; }}", "B<".repeat(40), format!("{}>", "[]".repeat(10)).repeat(40));
        assert!(depth(&generic) * JAVAC_LEVELS_PER_NODE > DEEPLY_NESTED);
        assert!(depth(&format!("class A {{ int x{}; }}", "[]".repeat(400))) * JAVAC_LEVELS_PER_NODE > DEEPLY_NESTED);
        let chain = format!("class A {{ Object f() {{ return b(){}; }} }}", ".c()".repeat(400));
        assert!(depth(&chain) * JAVAC_LEVELS_PER_NODE > DEEPLY_NESTED);
        assert!(flat * JAVAC_LEVELS_PER_NODE < DEEPLY_NESTED);
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
